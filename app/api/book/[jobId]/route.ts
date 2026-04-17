// GET /api/book/[jobId] — poll a booking's current status.
// Edge runtime: PostgREST HTTPS over supabaseAdmin (no TCP deps).
// jobId is the bookings.id UUID.
//
// Next.js 16 note: dynamic `params` is async — must be awaited before use.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/db/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestIdFrom(req: NextRequest): string {
  const given = req.headers.get('x-request-id');
  if (given && given.length <= 128) return given;
  // Lightweight ULID replacement — Edge has crypto.randomUUID. Format:
  //   req_<12-char-hex> derived from a randomUUID.
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'job_not_found',
        message: 'booking not found for this jobId',
        request_id: requestId,
      },
    },
    { status: 404, headers: { 'X-Request-ID': requestId } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;
  const requestId = requestIdFrom(req);

  if (!UUID_V4_RE.test(jobId)) {
    return notFound(requestId);
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(
      'id, status, seat_id, train_id, price_paise, failure_reason, created_at, confirmed_at',
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: {
          code: 'upstream_failure',
          message: error.message,
          request_id: requestId,
        },
      },
      { status: 502, headers: { 'X-Request-ID': requestId } },
    );
  }

  if (!data) return notFound(requestId);

  return NextResponse.json(
    {
      jobId: data.id,
      status: data.status,
      queuedAt: data.created_at,
      confirmedAt: data.confirmed_at,
      seatId: data.seat_id,
      trainId: data.train_id,
      pricePaise: data.price_paise,
      failureReason: data.failure_reason,
    },
    {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        // Short SWR so poll clients don't thrash the DB while the worker completes.
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
