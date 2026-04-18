// GET /api/admin/recent-bookings — last N bookings for the /ops live table.
// Auth-gated so the secret you already pasted for other admin calls works.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin/auth';
import { sql } from '@/lib/db/pg';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Read bucket — polled every 2s by /ops. See ADR-011 Consequences.
  const auth = await requireAdmin(req, { kind: 'read' });
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.errorCode, message: 'auth' } },
      { status: auth.errorCode === 'rate_limit_exceeded' ? 429 : 401 },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);
  const rows = await sql<
    {
      id: string;
      status: string;
      seat_id: string | null;
      passenger_name: string;
      failure_reason: string | null;
      created_at: string;
      confirmed_at: string | null;
    }[]
  >`
    SELECT id::text, status::text, seat_id, passenger_name, failure_reason,
           created_at, confirmed_at
      FROM bookings
     ORDER BY created_at DESC
     LIMIT ${limit}::int
  `;

  return NextResponse.json(
    {
      bookings: rows.map((r) => ({
        id: r.id,
        status: r.status,
        seatId: r.seat_id,
        passengerName: r.passenger_name,
        failureReason: r.failure_reason,
        createdAt: r.created_at,
        confirmedAt: r.confirmed_at,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
