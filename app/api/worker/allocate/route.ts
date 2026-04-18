// POST /api/worker/allocate — QStash consumer, 9-step pipeline per
// API_CONTRACT §6.1. The handler is wrapped by verifySignatureAppRouter which
// enforces the Upstash-Signature JWT against the raw body (401 on fail — we
// never see that request). Handler returns:
//   - 200  on success OR operational failures (sold_out / expired — these are
//          body-level `status: FAILED|EXPIRED`, HTTP says "we processed it")
//   - 500  on transient failures — QStash retries with exponential backoff
//   - 489 + Upstash-NonRetryable-Error: true  on permanent failures — QStash
//          skips remaining retries, routes to DLQ, fires failureCallback
//
// The 9 steps from API_CONTRACT:
//   1 verify signature              (handled by wrapper)
//   2 parse + Zod validate body
//   3 if booking already terminal   → ack (QStash re-delivery idempotency)
//   4 allocate_seat via SKIP LOCKED (Cockatiel-wrapped)
//   5 if 0 rows                     → release_hold(sold_out) + cache body + ack
//   6 paymentService.charge         (Cockatiel-wrapped)
//   7 confirm_booking               (0 rows if hold expired → refund + EXPIRED)
//   8 write_idempotency_response    (caches terminal 200 body)
//   9 return final state

import type { NextRequest } from 'next/server';
import { ulid } from 'ulid';

import { verifySignatureAppRouter } from '@/infra/qstash/verifier';
import { AllocateJobSchema } from '@/lib/validation/worker';
import { getBookingById } from '@/lib/db/repositories/bookings';
import { allocateSeatWithPolicy } from '@/lib/allocation/allocate-seat';
import {
  confirmHold,
  releaseHoldForRetry,
  releaseHoldTerminally,
} from '@/lib/allocation/hold-state-machine';
import { charge, refund, PaymentError } from '@/lib/payment/mock-service';
import { paymentPolicy } from '@/lib/resilience/payment-policy';
import { commitIdempotencyResponse } from '@/lib/idempotency/postgres-authority';
import { maybeInjectChaos, WorkerChaosError } from '@/lib/chaos/worker-gate';
import { logger } from '@/lib/logging/logger';
import { record } from '@/lib/metrics/registry';
import { scheduleMetricsPush } from '@/lib/metrics/pusher';
import { M } from '@/lib/metrics/names';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HOLD_DURATION_SEC = Number(process.env.HOLD_DURATION_SEC ?? 300);

function nonRetryable(
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message, ...extra } }), {
    status: 489,
    headers: {
      'Content-Type': 'application/json',
      'Upstash-NonRetryable-Error': 'true',
    },
  });
}

function transientError(code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ok(body: Record<string, unknown>): Response {
  return Response.json({ ok: true, ...body });
}

async function handler(req: NextRequest): Promise<Response> {
  scheduleMetricsPush();
  const requestId = `req_${ulid().toLowerCase()}`;
  const retried = Number(req.headers.get('upstash-retried') ?? 0);
  const messageId = req.headers.get('upstash-message-id') ?? 'unknown';
  const log = logger.child({ request_id: requestId, qstash_message_id: messageId, retried });

  // Step 0: chaos injection point (demo only; noop when flag absent).
  try {
    await maybeInjectChaos();
  } catch (e) {
    if (e instanceof WorkerChaosError) {
      log.warn({ mode: e.mode }, 'chaos_triggered');
      record.counter(M.chaosTriggeredTotal, { mode: e.mode });
      return transientError('upstream_failure', `chaos_${e.mode}`);
    }
    throw e;
  }

  // Step 2: parse + validate
  let job: ReturnType<typeof AllocateJobSchema.parse>;
  try {
    const body = (await req.json()) as unknown;
    const parsed = AllocateJobSchema.safeParse(body);
    if (!parsed.success) {
      log.error({ issues: parsed.error.issues }, 'worker_invalid_body');
      return nonRetryable('invalid_request_body', 'worker job failed schema validation', {
        issues: parsed.error.issues,
      });
    }
    job = parsed.data;
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : String(e) }, 'worker_body_parse_failed');
    return nonRetryable('invalid_request_body', 'could not parse worker job body');
  }

  const cLog = log.child({ booking_id: job.bookingId, train_id: job.trainId });

  // Step 3: booking idempotency (guard against QStash re-delivery)
  const booking = await getBookingById(job.bookingId);
  if (!booking) {
    cLog.error('worker_booking_not_found');
    return nonRetryable('job_not_found', 'booking row does not exist', {
      bookingId: job.bookingId,
    });
  }
  if (booking.status !== 'PENDING') {
    cLog.info({ status: booking.status }, 'worker_booking_already_terminal');
    return ok({ bookingId: job.bookingId, status: booking.status });
  }

  // Step 4: allocate seat (Cockatiel: timeout + retry + breaker)
  let allocated;
  try {
    allocated = await allocateSeatWithPolicy({
      trainId: job.trainId,
      bookingId: job.bookingId,
      passengerName: job.passengerName,
      holdDurationSec: HOLD_DURATION_SEC,
    });
  } catch (e) {
    cLog.error(
      { err: e instanceof Error ? e.message : String(e) },
      'allocate_seat_policy_failed',
    );
    record.counter(M.retriesTotal, { stage: 'allocation' });
    return transientError('upstream_failure', 'allocation failed; QStash will retry');
  }

  // Step 5: sold out path — no seat, mark FAILED, cache response.
  // Terminal release: sold_out is permanent — no retry can produce a seat.
  if (!allocated) {
    cLog.info('sold_out');
    await releaseHoldTerminally({ bookingId: job.bookingId, reason: 'sold_out' });
    const body = {
      jobId: job.bookingId,
      status: 'FAILED',
      failureReason: 'sold_out',
      trainId: job.trainId,
    };
    await commitIdempotencyResponse({ key: job.idempotencyKey, status: 200, body });
    record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'sold_out' });
    return ok(body);
  }

  cLog.info({ seat_id: allocated.seat_id, version: allocated.version }, 'seat_reserved');
  record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'reserved' });

  // Step 6: charge payment (Cockatiel: timeout + retry + breaker)
  let paymentId: string;
  try {
    const result = await paymentPolicy.execute(() =>
      charge({
        amountPaise: booking.price_paise,
        idempotencyKey: job.idempotencyKey,
      }),
    );
    paymentId = result.paymentId;
    record.counter(M.paymentsTotal, {
      status: 'succeeded',
      replayed: String(result.replayed),
    });
  } catch (e) {
    if (e instanceof PaymentError) {
      cLog.warn({ code: e.code, retried }, 'payment_failed');
      record.counter(M.paymentsTotal, { status: 'failed', replayed: 'false' });

      // QStash retries:3 → Upstash-Retried ∈ {0..3}. Retried=3 is the final
      // attempt. payment_declined is a permanent decision — repeat attempts
      // won't change it.
      const isLastAttempt = retried >= 3;
      const isPermanent = e.code === 'payment_declined';

      if (isPermanent || isLastAttempt) {
        // TERMINAL: release seat + mark booking FAILED in one call.
        await releaseHoldTerminally({
          bookingId: job.bookingId,
          reason: e.code === 'payment_declined' ? 'payment_failed' : 'payment_timeout',
        });
        const body = {
          jobId: job.bookingId,
          status: 'FAILED',
          failureReason: 'payment_failed',
          trainId: job.trainId,
        };
        await commitIdempotencyResponse({
          key: job.idempotencyKey,
          status: 200,
          body,
        });
        record.counter(M.dlqTotal, { reason: e.code });
        return nonRetryable(
          'payment_failed',
          `mock payment ${e.code} on attempt ${retried + 1}`,
          { paymentErrorCode: e.code },
        );
      }

      // RETRYABLE: release the seat so the next attempt is clean, but leave
      // booking.status = PENDING so the `booking.status !== 'PENDING'` guard
      // at step 3 of the next delivery doesn't short-circuit. This was the
      // O4 bug — old releaseReservation stamped FAILED unconditionally and
      // silently burned the QStash retry budget.
      await releaseHoldForRetry(job.bookingId);
      record.counter(M.retriesTotal, { stage: 'payment' });
      return transientError('upstream_failure', `mock payment ${e.code} — retry`);
    }

    // Unexpected non-PaymentError (e.g. Cockatiel breaker open, timeout).
    // O1 fix: previously this path returned 500 without releasing the seat,
    // leaving it RESERVED until the 60s sweeper expired the hold 5 min later
    // (observed as the "25 EXPIRED" anomaly). Now we release retryably so
    // QStash can redeliver cleanly, or terminally on the last attempt.
    cLog.error(
      { err: e instanceof Error ? e.message : String(e), retried },
      'payment_unexpected_error',
    );
    const isLastAttempt = retried >= 3;
    if (isLastAttempt) {
      await releaseHoldTerminally({
        bookingId: job.bookingId,
        reason: 'worker_error',
      });
      const body = {
        jobId: job.bookingId,
        status: 'FAILED',
        failureReason: 'worker_error',
        trainId: job.trainId,
      };
      await commitIdempotencyResponse({
        key: job.idempotencyKey,
        status: 200,
        body,
      });
      record.counter(M.dlqTotal, { reason: 'worker_error' });
      return nonRetryable('upstream_failure', 'payment policy error — retries exhausted');
    }
    await releaseHoldForRetry(job.bookingId);
    record.counter(M.retriesTotal, { stage: 'payment' });
    return transientError('upstream_failure', 'payment policy error — retry');
  }

  cLog.info({ payment_id: paymentId }, 'payment_succeeded');

  // Step 7: confirm booking (atomic seat RESERVED→CONFIRMED + booking→CONFIRMED)
  let confirmed;
  try {
    confirmed = await confirmHold({
      bookingId: job.bookingId,
      seatId: allocated.seat_id,
      paymentId,
    });
  } catch (e) {
    cLog.error(
      { err: e instanceof Error ? e.message : String(e) },
      'confirm_booking_failed',
    );
    record.counter(M.retriesTotal, { stage: 'confirm' });
    return transientError('upstream_failure', 'confirm failed — retry');
  }

  if (!confirmed) {
    // Hold expired mid-payment (sweeper won the race). Refund + mark EXPIRED.
    // `failureReason` is the canonical body-level `hold_expired` code per
    // API_CONTRACT §3. We log the sub-variant ("during payment") to
    // distinguish from the pure sweeper path, but the shipped wire code is
    // always `hold_expired` so downstream consumers can match a single value.
    cLog.warn('hold_expired_during_payment');
    await refund(paymentId);
    const body = {
      jobId: job.bookingId,
      status: 'EXPIRED',
      failureReason: 'hold_expired',
      trainId: job.trainId,
    };
    await commitIdempotencyResponse({
      key: job.idempotencyKey,
      status: 200,
      body,
    });
    record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'expired' });
    return ok(body);
  }

  // Step 8: cache the terminal 200 CONFIRMED body — future replays on this
  // idempotency key return this shape with Idempotent-Replayed: true.
  const confirmedAt = new Date().toISOString();
  const body = {
    jobId: job.bookingId,
    status: 'CONFIRMED',
    seatId: allocated.seat_id,
    passengerName: job.passengerName,
    pricePaise: booking.price_paise,
    confirmedAt,
  };
  await commitIdempotencyResponse({
    key: job.idempotencyKey,
    status: 200,
    body,
  });

  cLog.info({ seat_id: allocated.seat_id, payment_id: paymentId }, 'booking_confirmed');
  record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'confirmed' });

  // Step 9: final response (QStash ACKs on 2xx)
  return ok(body);
}

export const POST = verifySignatureAppRouter(handler);
