// GET /api/admin/live-stats — single-shot DB snapshot for the /ops UI to
// plot when Grafana/Prometheus is unavailable (e.g. running locally against
// a fresh Docker Supabase with no metric push target configured).
//
// Returns: current inventory + bookings-per-second rate over last 60s,
// plus rolling counters for the 6 hero tiles. Auth-gated same as other
// /api/admin/* routes.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin/auth';
import { sql } from '@/lib/db/pg';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.errorCode, message: 'auth' } },
      { status: auth.errorCode === 'rate_limit_exceeded' ? 429 : 401 },
    );
  }

  const [inv] = await sql<
    { available: number; reserved: number; confirmed: number }[]
  >`
    SELECT
      SUM(CASE WHEN status='AVAILABLE' THEN 1 ELSE 0 END)::int AS available,
      SUM(CASE WHEN status='RESERVED'  THEN 1 ELSE 0 END)::int AS reserved,
      SUM(CASE WHEN status='CONFIRMED' THEN 1 ELSE 0 END)::int AS confirmed
    FROM seats WHERE train_id='12951'
  `;

  const [bookings] = await sql<
    { total: number; pending: number; confirmed: number; failed: number; expired: number }[]
  >`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN status='PENDING'   THEN 1 ELSE 0 END)::int AS pending,
      SUM(CASE WHEN status='CONFIRMED' THEN 1 ELSE 0 END)::int AS confirmed,
      SUM(CASE WHEN status='FAILED'    THEN 1 ELSE 0 END)::int AS failed,
      SUM(CASE WHEN status='EXPIRED'   THEN 1 ELSE 0 END)::int AS expired
    FROM bookings
  `;

  // Per-second time series — last 60s, 1s buckets.
  //
  // Three separate per-event CTEs keyed on the RIGHT timestamp column each
  // (confirmed_at for confirms, updated_at for failures, created_at for
  // ingress), left-joined to a `seconds` spine. The previous single-join
  // design filtered bookings by created_at then summed over confirmed_at,
  // which silently drops every row where confirm landed >2s after create —
  // exactly what happens under surge, so the chart sat at 0 while 500
  // confirmations had already hit the DB.
  const perSec = await sql<{ t: number; confirmed: number; failed: number; ingress: number }[]>`
    WITH seconds AS (
      SELECT generate_series(
        date_trunc('second', now()) - interval '59 seconds',
        date_trunc('second', now()),
        interval '1 second'
      ) AS sec
    ),
    confirmed_per_sec AS (
      SELECT date_trunc('second', confirmed_at) AS sec, COUNT(*)::int AS n
      FROM bookings
      WHERE status = 'CONFIRMED'
        AND confirmed_at >= date_trunc('second', now()) - interval '59 seconds'
        AND confirmed_at <= date_trunc('second', now()) + interval '1 second'
      GROUP BY 1
    ),
    failed_per_sec AS (
      SELECT date_trunc('second', updated_at) AS sec, COUNT(*)::int AS n
      FROM bookings
      WHERE status = 'FAILED'
        AND updated_at >= date_trunc('second', now()) - interval '59 seconds'
        AND updated_at <= date_trunc('second', now()) + interval '1 second'
      GROUP BY 1
    ),
    ingress_per_sec AS (
      SELECT date_trunc('second', created_at) AS sec, COUNT(*)::int AS n
      FROM bookings
      WHERE created_at >= date_trunc('second', now()) - interval '59 seconds'
        AND created_at <= date_trunc('second', now()) + interval '1 second'
      GROUP BY 1
    )
    SELECT
      EXTRACT(EPOCH FROM s.sec)::int AS t,
      COALESCE(c.n, 0) AS confirmed,
      COALESCE(f.n, 0) AS failed,
      COALESCE(i.n, 0) AS ingress
    FROM seconds s
    LEFT JOIN confirmed_per_sec c ON c.sec = s.sec
    LEFT JOIN failed_per_sec   f ON f.sec = s.sec
    LEFT JOIN ingress_per_sec  i ON i.sec = s.sec
    ORDER BY s.sec
  `;

  const [dlq] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM dlq_jobs WHERE resolved_at IS NULL
  `;

  return NextResponse.json(
    {
      inventory: inv,
      bookings,
      dlq: dlq?.n ?? 0,
      series: perSec,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
