// Pure async function that runs the worker allocation pipeline end-to-end
// for a single job. Extracted from app/api/worker/allocate/route.ts so the
// SAME logic can be called either from the HTTP handler (production path,
// QStash-dispatched) OR directly in-process (local-dev bypass path, no
// HTTP round-trip). Returns a typed outcome so the bypass caller can log
// without having to reconstruct an HTTP response.

import { AllocateJobSchema, type AllocateJob } from '@/lib/validation/worker';
import { getBookingById } from '@/lib/db/repositories/bookings';
import { allocateSeatWithPolicy } from '@/lib/allocation/allocate-seat';
import {
  confirmHold,
  releaseReservation,
} from '@/lib/allocation/hold-state-machine';
import { charge, refund, PaymentError } from '@/lib/payment/mock-service';
import { paymentPolicy } from '@/lib/resilience/payment-policy';
import { commitIdempotencyResponse } from '@/lib/idempotency/postgres-authority';
import { maybeInjectChaos, WorkerChaosError } from '@/lib/chaos/worker-gate';
import { logger } from '@/lib/logging/logger';
import { record } from '@/lib/metrics/registry';
import { M } from '@/lib/metrics/names';

export type WorkerOutcome =
  | { kind: 'confirmed'; seatId: string; paymentId: string }
  | { kind: 'sold_out' }
  | { kind: 'expired' }
  | { kind: 'payment_failed'; code: string; permanent: boolean }
  | { kind: 'invalid'; reason: string }
  | { kind: 'transient'; reason: string };

const HOLD_DURATION_SEC = Number(process.env.HOLD_DURATION_SEC ?? 300);

export async function runWorkerJob(
  rawJob: unknown,
  opts: { retried?: number } = {},
): Promise<WorkerOutcome> {
  const retried = opts.retried ?? 0;

  try {
    await maybeInjectChaos();
  } catch (e) {
    if (e instanceof WorkerChaosError) {
      record.counter(M.chaosTriggeredTotal, { mode: e.mode });
      return { kind: 'transient', reason: `chaos_${e.mode}` };
    }
    throw e;
  }

  const parsed = AllocateJobSchema.safeParse(rawJob);
  if (!parsed.success) {
    return { kind: 'invalid', reason: 'schema_validation_failed' };
  }
  const job: AllocateJob = parsed.data;
  const log = logger.child({ booking_id: job.bookingId, train_id: job.trainId, retried });

  // Step 3: idempotency — booking already terminal?
  const booking = await getBookingById(job.bookingId);
  if (!booking) return { kind: 'invalid', reason: 'booking_not_found' };
  if (booking.status !== 'PENDING') {
    log.info({ status: booking.status }, 'worker_booking_already_terminal');
    if (booking.status === 'CONFIRMED') {
      return {
        kind: 'confirmed',
        seatId: booking.seat_id ?? '',
        paymentId: booking.payment_id ?? '',
      };
    }
    return { kind: 'sold_out' };
  }

  // Step 4: allocate seat
  let allocated;
  try {
    allocated = await allocateSeatWithPolicy({
      trainId: job.trainId,
      bookingId: job.bookingId,
      passengerName: job.passengerName,
      holdDurationSec: HOLD_DURATION_SEC,
    });
  } catch (e) {
    record.counter(M.retriesTotal, { stage: 'allocation' });
    return { kind: 'transient', reason: e instanceof Error ? e.message : String(e) };
  }

  if (!allocated) {
    await releaseReservation({ bookingId: job.bookingId, reason: 'sold_out' });
    await commitIdempotencyResponse({
      key: job.idempotencyKey,
      status: 200,
      body: {
        jobId: job.bookingId,
        status: 'FAILED',
        failureReason: 'sold_out',
        trainId: job.trainId,
      },
    });
    record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'sold_out' });
    return { kind: 'sold_out' };
  }
  record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'reserved' });

  // Step 6: charge
  let paymentId: string;
  try {
    const r = await paymentPolicy.execute(() =>
      charge({ amountPaise: booking.price_paise, idempotencyKey: job.idempotencyKey }),
    );
    paymentId = r.paymentId;
    record.counter(M.paymentsTotal, { status: 'succeeded', replayed: String(r.replayed) });
  } catch (e) {
    if (e instanceof PaymentError) {
      await releaseReservation({
        bookingId: job.bookingId,
        reason: e.code === 'payment_declined' ? 'payment_failed' : 'payment_timeout',
      });
      record.counter(M.paymentsTotal, { status: 'failed', replayed: 'false' });
      const permanent = e.code === 'payment_declined' || retried >= 3;
      if (permanent) {
        await commitIdempotencyResponse({
          key: job.idempotencyKey,
          status: 200,
          body: {
            jobId: job.bookingId,
            status: 'FAILED',
            failureReason: 'payment_failed',
            trainId: job.trainId,
          },
        });
        record.counter(M.dlqTotal, { reason: e.code });
      } else {
        record.counter(M.retriesTotal, { stage: 'payment' });
      }
      return { kind: 'payment_failed', code: e.code, permanent };
    }
    return { kind: 'transient', reason: e instanceof Error ? e.message : String(e) };
  }

  // Step 7: confirm
  let confirmed;
  try {
    confirmed = await confirmHold({
      bookingId: job.bookingId,
      seatId: allocated.seat_id,
      paymentId,
    });
  } catch (e) {
    record.counter(M.retriesTotal, { stage: 'confirm' });
    return { kind: 'transient', reason: e instanceof Error ? e.message : String(e) };
  }

  if (!confirmed) {
    // Hold expired mid-payment. Canonical body-level `failureReason` is
    // `hold_expired` per API_CONTRACT §3; the "during payment" sub-variant
    // lives in logs only so sweeper-path + worker-path responses match.
    await refund(paymentId);
    await commitIdempotencyResponse({
      key: job.idempotencyKey,
      status: 200,
      body: {
        jobId: job.bookingId,
        status: 'EXPIRED',
        failureReason: 'hold_expired',
        trainId: job.trainId,
      },
    });
    record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'expired' });
    return { kind: 'expired' };
  }

  // Step 8: cache the terminal 200 CONFIRMED body
  await commitIdempotencyResponse({
    key: job.idempotencyKey,
    status: 200,
    body: {
      jobId: job.bookingId,
      status: 'CONFIRMED',
      seatId: allocated.seat_id,
      passengerName: job.passengerName,
      pricePaise: booking.price_paise,
      confirmedAt: new Date().toISOString(),
    },
  });
  record.counter(M.allocationsTotal, { train_id: job.trainId, outcome: 'confirmed' });
  return { kind: 'confirmed', seatId: allocated.seat_id, paymentId };
}
