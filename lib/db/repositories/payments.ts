// Repository for payments. Used by the mock payment service (Phase 3) to
// implement same-idempotency-key charge lookup — the Stripe-style
// "attempt-N returns existing row" pattern that prevents double-charges.

import { sql } from '../client';

export type PaymentStatus = 'succeeded' | 'failed' | 'pending';

export interface PaymentRow {
  id: string;
  idempotency_key: string;
  amount_paise: number;
  status: PaymentStatus;
  error_code: string | null;
  created_at: string;
}

export async function getPaymentByIdempotencyKey(
  key: string,
): Promise<PaymentRow | null> {
  const rows = await sql<PaymentRow[]>`
    SELECT id::text, idempotency_key, amount_paise, status::text AS status,
           error_code, created_at
      FROM payments
     WHERE idempotency_key = ${key}
  `;
  return rows[0] ?? null;
}

export async function createPayment(args: {
  idempotencyKey: string;
  amountPaise: number;
  status: PaymentStatus;
  errorCode?: string | null;
}): Promise<PaymentRow> {
  const rows = await sql<PaymentRow[]>`
    INSERT INTO payments (idempotency_key, amount_paise, status, error_code)
    VALUES (
      ${args.idempotencyKey},
      ${args.amountPaise}::int,
      ${args.status}::payment_status,
      ${args.errorCode ?? null}
    )
    RETURNING id::text, idempotency_key, amount_paise,
              status::text AS status, error_code, created_at
  `;
  return rows[0]!;
}
