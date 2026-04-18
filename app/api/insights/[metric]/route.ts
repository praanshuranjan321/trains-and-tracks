// GET /api/insights/[metric] — Edge-runtime proxy to Grafana Cloud Prometheus
// HTTP API. Recharts on the landing + /ops reads from here so the browser
// never sees Grafana credentials (ADR-009).
//
// v16: dynamic `params` is a Promise.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BrokenCircuitError } from 'cockatiel';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Human metric name → PromQL. Allowlist prevents arbitrary query execution.
 * `{ENV}` is replaced at request time with `env="<current env>"` so local-dev
 * traffic and production traffic render on separate series even though they
 * share one Grafana Cloud tenant. Every metric selector carries the label via
 * `registry.setDefaultLabels`.
 */
const QUERIES: Record<string, string> = {
  bookings_per_sec:
    'sum(rate(tg_allocations_total{outcome="confirmed",{ENV}}[1m]))',
  ingress_per_sec:
    'sum(rate(tg_booking_requests_total{{ENV}}[1m]))',
  rejections_per_sec:
    'sum by (reason)(rate(tg_rejections_total{{ENV}}[1m]))',
  p95_latency_ms:
    'histogram_quantile(0.95, sum by (le,route)(rate(tg_http_request_duration_seconds_bucket{{ENV}}[1m]))) * 1000',
  p99_latency_ms:
    'histogram_quantile(0.99, sum by (le,route)(rate(tg_http_request_duration_seconds_bucket{{ENV}}[1m]))) * 1000',
  queue_depth: 'sum(tg_queue_depth{{ENV}})',
  seats_remaining: 'sum(tg_seats_remaining{{ENV}})',
  retries_per_sec: 'sum(rate(tg_retries_total{{ENV}}[1m]))',
  dlq_count: 'sum(tg_dlq_total{{ENV}})',
  breaker_state: 'max(tg_breaker_state{{ENV}})',
};

/** Which env's metrics to query. Caller can override via `?env=` for the
 *  "I'm on local but want to peek at production" case. Default matches the
 *  process's own env label (same precedence as the emitter side). */
function envLabelFor(req: NextRequest): string {
  const override = new URL(req.url).searchParams.get('env');
  if (override && /^[A-Za-z0-9_-]{1,32}$/.test(override)) return override;
  return process.env.METRICS_ENV ?? process.env.VERCEL_ENV ?? 'local';
}

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

  const template = QUERIES[metric];
  if (!template) {
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

  // Substitute env label into the allowlisted template. `envLabelFor` returns
  // only [A-Za-z0-9_-], so the interpolation is safe from PromQL injection.
  const envLabel = envLabelFor(req);
  const query = template.replaceAll('{ENV}', `env="${envLabel}"`);

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
    // Breaker-tripped path — fail CLOSED per FAILURE_MATRIX §3.3. 503 +
    // Retry-After: 30. Defensive today (this proxy only hits Grafana HTTPS,
    // not pg-policy) but preserves symmetry across public endpoints so
    // callers see a consistent fail-closed signal regardless of which
    // dependency tripped.
    if (e instanceof BrokenCircuitError) {
      return NextResponse.json(
        {
          error: {
            code: 'circuit_open',
            message: 'Downstream temporarily unavailable — retry in 30s',
            request_id: requestId,
          },
        },
        {
          status: 503,
          headers: { 'X-Request-ID': requestId, 'Retry-After': '30' },
        },
      );
    }
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
