// GET /api/seats?train_id=12951 — seat inventory for the booking grid.
// Returns each seat's current status in a form the /book UI renders directly.
// Edge runtime: single PostgREST query, no TCP deps.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BrokenCircuitError } from 'cockatiel';

import { supabaseAdmin } from '@/lib/db/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface SeatRow {
  id: string;
  coach: string;
  seat_number: string;
  status: 'AVAILABLE' | 'RESERVED' | 'CONFIRMED';
}

function requestIdFrom(req: NextRequest): string {
  const given = req.headers.get('x-request-id');
  if (given && given.length <= 128) return given;
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(req);
  const trainId = new URL(req.url).searchParams.get('train_id') ?? '12951';

  let data: unknown[] | null = null;
  try {
    const res = await supabaseAdmin
      .from('seats')
      .select('id, coach, seat_number, status')
      .eq('train_id', trainId)
      .order('id', { ascending: true });

    if (res.error) {
      return NextResponse.json(
        { error: { code: 'upstream_failure', message: res.error.message, request_id: requestId } },
        { status: 502, headers: { 'X-Request-ID': requestId } },
      );
    }
    data = res.data;
  } catch (e: unknown) {
    // Breaker tripped in any future Cockatiel-wrapped dependency — fail CLOSED
    // per FAILURE_MATRIX §3.3. 503 + Retry-After: 30. Today supabase-js
    // PostgREST is not wrapped, so this is defensive for future wiring (e.g.
    // if seats inventory moves behind the pgPolicy-guarded pg client).
    if (e instanceof BrokenCircuitError) {
      return NextResponse.json(
        {
          error: {
            code: 'circuit_open',
            message: 'Downstream temporarily unavailable — retry in 30s',
            request_id: requestId,
          },
        },
        { status: 503, headers: { 'X-Request-ID': requestId, 'Retry-After': '30' } },
      );
    }
    throw e;
  }

  const rows = ((data ?? []) as unknown[]) as SeatRow[];
  const counts = { available: 0, reserved: 0, confirmed: 0 };
  for (const r of rows) {
    if (r.status === 'AVAILABLE') counts.available++;
    else if (r.status === 'RESERVED') counts.reserved++;
    else counts.confirmed++;
  }

  return NextResponse.json(
    {
      trainId,
      total: rows.length,
      ...counts,
      seats: rows.map((r) => ({
        id: r.id,
        coach: r.coach,
        seatNumber: r.seat_number,
        status: r.status,
      })),
    },
    {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        // 1-second SWR absorbs polling from the seat grid.
        'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=5',
      },
    },
  );
}
