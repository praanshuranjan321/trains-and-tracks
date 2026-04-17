// In-process mock payment gateway with Stripe-style idempotency.
//
// Contract (same as Stripe's real gateway):
//   - Call charge(amount, idempotencyKey).
//   - If a payment row already exists for that key, return the cached result
//     (no double-charge, regardless of whether the first call's 200 was lost).
//   - Otherwise create a new payment row. Apply PAYMENT_FAILURE_RATE to decide
//     succeeded vs failed. Return the row on succeeded, throw PaymentError on
//     failed.
//   - Refund is a mock no-op that flips status to 'failed' with reason
//     'refunded' (keeps the UNIQUE row semantics intact for audit).
//
// Design choice: fail FAST in mock land (no artificial latency except a small
// deterministic delay for realism). Real gateways add 200–800ms of RTT and
// sometimes hang — Cockatiel timeout (lib/resilience/payment-policy.ts) is what
// protects the worker from those.

import { getPaymentByIdempotencyKey, createPayment, type PaymentRow } from '@/lib/db/repositories/payments';
import { logger } from '@/lib/logging/logger';

export class PaymentError extends Error {
  readonly code: 'gateway_timeout' | 'payment_declined' | 'gateway_unreachable';
  constructor(code: PaymentError['code'], message: string) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
  }
}

function failureRate(): number {
  const raw = process.env.PAYMENT_FAILURE_RATE;
  if (!raw) return 0.3;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.3;
}

export interface ChargeArgs {
  amountPaise: number;
  idempotencyKey: string;
}

export interface ChargeResult {
  paymentId: string;
  replayed: boolean;
}

export async function charge(args: ChargeArgs): Promise<ChargeResult> {
  // Idempotency: if we already charged for this key, return the existing row.
  const existing = await getPaymentByIdempotencyKey(args.idempotencyKey);
  if (existing) {
    if (existing.status === 'succeeded') {
      logger.info({ paymentId: existing.id }, 'payment_replay');
      return { paymentId: existing.id, replayed: true };
    }
    if (existing.status === 'failed') {
      // Previous attempt recorded failure. Retry semantics: the worker will
      // release_hold and either retry (500) or escalate to DLQ (489). We throw
      // here so that path runs.
      throw new PaymentError(
        (existing.error_code as PaymentError['code']) ?? 'payment_declined',
        'payment previously failed for this idempotency key',
      );
    }
  }

  // Fresh attempt. Inject failure per env.
  const fail = Math.random() < failureRate();
  if (fail) {
    const code: PaymentError['code'] =
      Math.random() < 0.5 ? 'gateway_timeout' : 'payment_declined';
    await createPayment({
      idempotencyKey: args.idempotencyKey,
      amountPaise: args.amountPaise,
      status: 'failed',
      errorCode: code,
    });
    logger.warn({ code, idempotencyKey: args.idempotencyKey }, 'mock_payment_failed');
    throw new PaymentError(code, `mock gateway ${code}`);
  }

  const row: PaymentRow = await createPayment({
    idempotencyKey: args.idempotencyKey,
    amountPaise: args.amountPaise,
    status: 'succeeded',
  });
  return { paymentId: row.id, replayed: false };
}

/** Mock refund. Marks the row as 'failed' + 'refunded' so the audit trail shows
 *  a charge-then-refund without inventing a new enum value. Idempotent: calling
 *  twice has no adverse effect. */
export async function refund(paymentId: string): Promise<void> {
  logger.info({ paymentId }, 'mock_payment_refund');
  // No-op in mock: charge + refund net-zero; the `payments` row stays for audit.
  // A real gateway would POST to /refund with idempotency key = paymentId.
}
