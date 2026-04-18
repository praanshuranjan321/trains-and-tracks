// Hold/release state-machine helpers that the worker orchestrates:
//
//   AVAILABLE ─(allocate_seat)─▶ RESERVED (held_until = now() + 5min)
//       ▲                            │
//       │   (sweep_expired_holds) ───┤   (confirm_booking)
//       │                            │        │
//       │   (release_hold)           │        ▼
//       └────────────────────────────┴─▶ CONFIRMED
//
// Invariants (enforced in SQL by the CHECK constraint on `seats`):
//   AVAILABLE  → booking_id IS NULL, held_until IS NULL
//   RESERVED   → booking_id IS NOT NULL, held_until IS NOT NULL
//   CONFIRMED  → booking_id IS NOT NULL, held_until IS NULL
//
// These functions are thin coordinators over the SQL stored functions; the
// state transitions themselves happen atomically in Postgres. The worker uses
// them as typed entry points wrapped in the pg Cockatiel policy.

import {
  confirmBooking as rawConfirmBooking,
  releaseHold as rawReleaseHold,
  releaseHoldRetryable as rawReleaseHoldRetryable,
  releaseHoldTerminal as rawReleaseHoldTerminal,
} from '@/lib/db/repositories/bookings';
import { pgPolicy } from '@/lib/resilience/pg-policy';

/**
 * Move a seat from RESERVED → CONFIRMED. Returns null if the hold expired
 * mid-payment (sweeper raced us); caller MUST refund the payment.
 */
export async function confirmHold(args: {
  bookingId: string;
  seatId: string;
  paymentId: string;
}): Promise<{ booking_id: string } | null> {
  return pgPolicy.execute(() => rawConfirmBooking(args));
}

/**
 * @deprecated Use {@link releaseHoldForRetry} or {@link releaseHoldTerminally}.
 * Rollback: any RESERVED seat for this booking → AVAILABLE, booking → FAILED.
 * Kept for backward compat; no caller after 20260418.
 */
export async function releaseReservation(args: {
  bookingId: string;
  reason:
    | 'sold_out'
    | 'payment_failed'
    | 'payment_timeout'
    | 'worker_error';
}): Promise<number> {
  return pgPolicy.execute(() => rawReleaseHold(args));
}

/**
 * Retryable rollback: seat → AVAILABLE, booking STAYS PENDING.
 * Call from the transient-error branch of the worker so QStash's next
 * delivery can reprocess. Returns the number of seats freed (0 or 1).
 */
export async function releaseHoldForRetry(bookingId: string): Promise<number> {
  return pgPolicy.execute(() => rawReleaseHoldRetryable(bookingId));
}

/**
 * Terminal rollback: seat → AVAILABLE, booking → FAILED.
 * Idempotent. Call from permanent-error branches: payment_declined,
 * retries_exhausted, sold_out.
 */
export async function releaseHoldTerminally(args: {
  bookingId: string;
  reason:
    | 'sold_out'
    | 'payment_failed'
    | 'payment_timeout'
    | 'worker_error'
    | 'retries_exhausted'
    | 'retries_exhausted_http_489';
}): Promise<number> {
  return pgPolicy.execute(() => rawReleaseHoldTerminal(args));
}
