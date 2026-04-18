// GET /api/trains — list trains. API_CONTRACT §5.4.
//
// Edge runtime: PostgREST over HTTPS (no TCP deps). Response is cached 60s at
// the edge because the train set is effectively static (hackathon uses a
// single-train seed; see PRD §4.1 M1). X-Request-ID per API_CONTRACT §12
// invariant #2. No auth: train list is public by design (same posture as
// /api/seats which already ships un-authed inventory).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/db/supabase';

export const runtime = 'edge';

interface TrainRow {
  id: string;
  name: string;
  source: string;
  destination: string;
  departure_time: string;
  tatkal_opens_at: string;
  total_seats: number;
  base_price_paise: number;
}

function requestIdFrom(req: NextRequest): string {
  const given = req.headers.get('x-request-id');
  if (given && given.length <= 128) return given;
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(req);

  const { data, error } = await supabaseAdmin
    .from('trains')
    .select('id, name, source, destination, departure_time, tatkal_opens_at, total_seats, base_price_paise')
    .order('id', { ascending: true });

  if (error) {
    return NextResponse.json(
      {
        error: {
          code: 'upstream_failure',
          message: error.message,
          request_id: requestId,
        },
      },
      {
        status: 502,
        headers: { 'X-Request-ID': requestId },
      },
    );
  }

  const rows = (data ?? []) as TrainRow[];
  return NextResponse.json(
    {
      trains: rows.map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        destination: r.destination,
        departureTime: r.departure_time,
        tatkalOpensAt: r.tatkal_opens_at,
        totalSeats: r.total_seats,
        basePricePaise: r.base_price_paise,
      })),
    },
    {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
