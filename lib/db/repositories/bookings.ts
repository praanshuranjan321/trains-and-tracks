// Repository wrappers for bookings + the confirm/release/sweep lifecycle.

import { sql } from '../client';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';

export interface BookingRow {
  id: string;
  idempotency_key: string;
  train_id: string;
  seat_id: string | null;
  passenger_name: string;
  passenger_phone: string | null;
  price_paise: number;
  status: BookingStatus;
  failure_reason: string | null;
  payment_id: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface CreateBookingArgs {
  idempotencyKey: string;
  trainId: string;
  passengerName: string;
  passengerPhone?: string | null;
  pricePaise: number;
}

export async function createBooking(args: CreateBookingArgs): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (idempotency_key, train_id, passenger_name, passenger_phone, price_paise)
    VALUES (
      ${args.idempotencyKey}::text,
      ${args.trainId}::text,
      ${args.passengerName}::text,
      ${args.passengerPhone ?? null},
      ${args.pricePaise}::int
    )
    RETURNING id::text
  `;
  return rows[0]!;
}

export async function getBookingById(id: string): Promise<BookingRow | null> {
  const rows = await sql<BookingRow[]>`
    SELECT id::text, idempotency_key, train_id, seat_id, passenger_name,
           passenger_phone, price_paise, status::text AS status,
           failure_reason, payment_id::text, created_at, confirmed_at
      FROM bookings
     WHERE id = ${id}::uuid
  `;
  return rows[0] ?? null;
}

export async function getBookingByIdempotencyKey(
  key: string,
): Promise<BookingRow | null> {
  const rows = await sql<BookingRow[]>`
    SELECT id::text, idempotency_key, train_id, seat_id, passenger_name,
           passenger_phone, price_paise, status::text AS status,
           failure_reason, payment_id::text, created_at, confirmed_at
      FROM bookings
     WHERE idempotency_key = ${key}
  `;
  return rows[0] ?? null;
}

export async function confirmBooking(args: {
  bookingId: string;
  seatId: string;
  paymentId: string;
}): Promise<{ booking_id: string } | null> {
  const rows = await sql<{ booking_id: string }[]>`
    SELECT booking_id::text AS booking_id
      FROM confirm_booking(
        ${args.bookingId}::uuid,
        ${args.seatId}::text,
        ${args.paymentId}::uuid
      )
  `;
  return rows[0] ?? null;
}

export async function releaseHold(args: {
  bookingId: string;
  reason: string;
}): Promise<number> {
  const rows = await sql<{ release_hold: number }[]>`
    SELECT release_hold(${args.bookingId}::uuid, ${args.reason}::text) AS release_hold
  `;
  return rows[0]?.release_hold ?? 0;
}

export async function sweepExpiredHolds(): Promise<{
  swept_count: number;
  skipped: boolean;
}> {
  const rows = await sql<{ swept_count: number; skipped: boolean }[]>`
    SELECT swept_count, skipped FROM sweep_expired_holds()
  `;
  return rows[0] ?? { swept_count: 0, skipped: false };
}
