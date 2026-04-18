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
  const perSec = await sql<{ t: number; confirmed: number; failed: number; ingress: number }[]>`
    WITH seconds AS (
      SELECT generate_series(
        date_trunc('second', now()) - interval '59 seconds',
        date_trunc('second', now()),
        interval '1 second'
      ) AS sec
    )
    SELECT
      EXTRACT(EPOCH FROM s.sec)::int AS t,
      COALESCE(SUM(CASE WHEN b.status='CONFIRMED' AND b.confirmed_at >= s.sec AND b.confirmed_at < s.sec + interval '1 second' THEN 1 ELSE 0 END), 0)::int AS confirmed,
      COALESCE(SUM(CASE WHEN b.status='FAILED' AND b.updated_at >= s.sec AND b.updated_at < s.sec + interval '1 second' THEN 1 ELSE 0 END), 0)::int AS failed,
      COALESCE(SUM(CASE WHEN b.created_at >= s.sec AND b.created_at < s.sec + interval '1 second' THEN 1 ELSE 0 END), 0)::int AS ingress
    FROM seconds s
    LEFT JOIN bookings b ON b.created_at >= s.sec - interval '1 second' AND b.created_at < s.sec + interval '2 seconds'
    GROUP BY s.sec
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
