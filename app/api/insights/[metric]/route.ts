// GET /api/insights/[metric] — Edge-runtime proxy to Grafana Cloud Prometheus
// HTTP API. Recharts on the landing + /ops reads from here so the browser
// never sees Grafana credentials (ADR-009).
//
// v16: dynamic `params` is a Promise.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/** Human metric name → PromQL. Allowlist prevents arbitrary query execution. */
const QUERIES: Record<string, string> = {
  bookings_per_sec:
    'sum(rate(tg_allocations_total{outcome="confirmed"}[1m]))',
  ingress_per_sec:
    'sum(rate(tg_booking_requests_total[1m]))',
  rejections_per_sec:
    'sum by (reason)(rate(tg_rejections_total[1m]))',
  p95_latency_ms:
    'histogram_quantile(0.95, sum by (le,route)(rate(tg_http_request_duration_seconds_bucket[1m]))) * 1000',
  p99_latency_ms:
    'histogram_quantile(0.99, sum by (le,route)(rate(tg_http_request_duration_seconds_bucket[1m]))) * 1000',
  queue_depth: 'sum(tg_queue_depth)',
  seats_remaining: 'sum(tg_seats_remaining)',
  retries_per_sec: 'sum(rate(tg_retries_total[1m]))',
  dlq_count: 'sum(tg_dlq_total)',
  breaker_state: 'max(tg_breaker_state)',
};

interface PromPoint {
  t: number;
  v: number;
}

interface PromRangeResponse {
  status: 'success' | 'error';
  data?: {
    resultType: 'matrix' | 'vector';
    result: Array<{
      metric: Record<string, string>;
      values?: [number, string][];
      value?: [number, string];
    }>;
  };
  error?: string;
}

function requestIdFrom(req: NextRequest): string {
  const given = req.headers.get('x-request-id');
  if (given && given.length <= 128) return given;
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ metric: string }> },
): Promise<NextResponse> {
  const { metric } = await params;
  const requestId = requestIdFrom(req);

  const query = QUERIES[metric];
  if (!query) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_request_body',
          message: `unknown metric '${metric}'; valid: ${Object.keys(QUERIES).join(', ')}`,
          request_id: requestId,
        },
      },
      { status: 400, headers: { 'X-Request-ID': requestId } },
    );
  }

  const url = process.env.GRAFANA_PROM_READ_URL;
  const user = process.env.GRAFANA_PROM_USER;
  const token = process.env.GRAFANA_PROM_READ_TOKEN;
  if (!url || !user || !token) {
    return NextResponse.json(
      {
        error: {
          code: 'upstream_failure',
          message: 'grafana read creds not configured',
          request_id: requestId,
        },
      },
      { status: 502, headers: { 'X-Request-ID': requestId } },
    );
  }

  const search = new URL(req.url).searchParams;
  const rangeParam = search.get('range') ?? '5m';
  const stepParam = search.get('step') ?? '5s';

  const rangeSec =
    rangeParam.endsWith('m')
      ? Number(rangeParam.slice(0, -1)) * 60
      : Number(rangeParam.slice(0, -1));
  const end = Math.floor(Date.now() / 1000);
  const start = end - (Number.isFinite(rangeSec) ? rangeSec : 300);

  const qs = new URLSearchParams({
    query,
    start: String(start),
    end: String(end),
    step: stepParam,
  });
  const basicAuth = `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;

  try {
    const res = await fetch(`${url}/api/v1/query_range?${qs.toString()}`, {
      headers: { Authorization: basicAuth },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: {
            code: 'upstream_failure',
            message: `grafana prom ${res.status}`,
            request_id: requestId,
          },
        },
        { status: 502, headers: { 'X-Request-ID': requestId } },
      );
    }
    const body = (await res.json()) as PromRangeResponse;
    if (body.status !== 'success' || !body.data) {
      return NextResponse.json(
        {
          error: {
            code: 'upstream_failure',
            message: body.error ?? 'prom returned error',
            request_id: requestId,
          },
        },
        { status: 502, headers: { 'X-Request-ID': requestId } },
      );
    }

    const points: PromPoint[] = [];
    for (const series of body.data.result) {
      if (!series.values) continue;
      for (const [t, v] of series.values) {
        const num = Number(v);
        if (Number.isFinite(num)) points.push({ t, v: num });
      }
    }
    // Sort ascending by time — caller renders as time series.
    points.sort((a, b) => a.t - b.t);

    return NextResponse.json(
      {
        metric,
        query,
        unit: metric.includes('latency') ? 'ms' : metric.endsWith('_per_sec') ? 'req/s' : '',
        points,
      },
      {
        status: 200,
        headers: {
          'X-Request-ID': requestId,
          // Short SWR — poll interval is 2s on client.
          'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=5',
        },
      },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: {
          code: 'upstream_failure',
          message: e instanceof Error ? e.message : String(e),
          request_id: requestId,
        },
      },
      { status: 502, headers: { 'X-Request-ID': requestId } },
    );
  }
}
