// Repository wrapper for the allocate_seat stored function.
// Implements the SKIP LOCKED allocation pattern from ADR-006.
//
// Returns the allocated seat row or null if no seats available (sold out).
// 0-row path = sold_out; caller writes status=FAILED, failure_reason='sold_out'.

import { sql } from '../client';

export interface AllocatedSeat {
  seat_id: string;
  version: number;
}

export interface AllocateArgs {
  trainId: string;
  bookingId: string;
  passengerName: string;
  holdDurationSec?: number;
}

export async function allocateSeat(args: AllocateArgs): Promise<AllocatedSeat | null> {
  const holdInterval = `${args.holdDurationSec ?? 300} seconds`;
  const rows = await sql<AllocatedSeat[]>`
    SELECT seat_id, version
      FROM allocate_seat(
        ${args.trainId}::text,
        ${args.bookingId}::uuid,
        ${args.passengerName}::text,
        ${holdInterval}::interval
      )
  `;
  return rows[0] ?? null;
}

export interface SeatRow {
  id: string;
  train_id: string;
  coach: string;
  seat_number: string;
  status: 'AVAILABLE' | 'RESERVED' | 'CONFIRMED';
  booking_id: string | null;
  held_until: string | null;
  version: number;
}

export async function getSeat(seatId: string): Promise<SeatRow | null> {
  const rows = await sql<SeatRow[]>`
    SELECT id, train_id, coach, seat_number, status, booking_id,
           held_until, version
      FROM seats
     WHERE id = ${seatId}
  `;
  return rows[0] ?? null;
}

export interface SeatInventory {
  total: number;
  available: number;
  reserved: number;
  confirmed: number;
}

export async function getInventory(trainId: string): Promise<SeatInventory> {
  const rows = await sql<{ status: string; n: number }[]>`
    SELECT status::text AS status, COUNT(*)::int AS n
      FROM seats
     WHERE train_id = ${trainId}
     GROUP BY status
  `;
  const inv: SeatInventory = { total: 0, available: 0, reserved: 0, confirmed: 0 };
  for (const { status, n } of rows) {
    inv.total += n;
    if (status === 'AVAILABLE') inv.available = n;
    else if (status === 'RESERVED') inv.reserved = n;
    else if (status === 'CONFIRMED') inv.confirmed = n;
  }
  return inv;
}
