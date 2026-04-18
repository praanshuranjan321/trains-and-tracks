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
 * Rollback: any RESERVED seat for this booking → AVAILABLE, booking → FAILED.
 * Returns the number of seats freed (0 if no hold ever existed).
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
