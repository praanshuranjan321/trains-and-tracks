// Real prom-client registry — replaces the Phase 2 stub.
//
// Declarations match PRD §5.5 one-for-one. Histograms use the explicit
// bucket set from §5.5: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5] seconds.
//
// Counters are additive per invocation; their values are pushed to Grafana
// Mimir via `lib/metrics/pusher.ts` inside `waitUntil`. Push-not-scrape
// because scrape is broken on Vercel Fluid (every invocation has its own
// registry; a scrape hits a random instance and returns garbage).

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// `env` label separates local-dev metrics from production on the same Grafana
// Cloud tenant. Precedence: explicit METRICS_ENV override > VERCEL_ENV
// (auto-set by Vercel to 'production' | 'preview' | 'development') > 'local'.
// Dashboard panels filter `{env="production"}` so local traffic never
// pollutes demo views.
const ENV_LABEL =
  process.env.METRICS_ENV ?? process.env.VERCEL_ENV ?? 'local';

export const registry = new Registry();
registry.setDefaultLabels({
  service: 'trains-and-tracks',
  env: ENV_LABEL,
});
collectDefaultMetrics({ register: registry });

export { ENV_LABEL };

// --- Counters ---------------------------------------------------------------

export const mBookingRequests = new Counter({
  name: 'tg_booking_requests_total',
  help: 'POST /api/book total requests',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const mAdmissions = new Counter({
  name: 'tg_admissions_total',
  help: 'Admitted requests by reason',
  labelNames: ['reason'],
  registers: [registry],
});

export const mRejections = new Counter({
  name: 'tg_rejections_total',
  help: 'Rejected requests by reason',
  labelNames: ['reason'],
  registers: [registry],
});

export const mAllocations = new Counter({
  name: 'tg_allocations_total',
  help: 'Seat allocation outcomes by train',
  labelNames: ['train_id', 'outcome'],
  registers: [registry],
});

export const mRetries = new Counter({
  name: 'tg_retries_total',
  help: 'Retries per pipeline stage',
  labelNames: ['stage'],
  registers: [registry],
});

export const mDlq = new Counter({
  name: 'tg_dlq_total',
  help: 'DLQ entries by reason',
  labelNames: ['reason'],
  registers: [registry],
});

export const mCacheHits = new Counter({
  name: 'tg_cache_hits_total',
  help: 'Cache layer hit/miss/error',
  labelNames: ['result'],
  registers: [registry],
});

export const mIdemCacheHits = new Counter({
  name: 'tg_idempotency_cache_hit_total',
  help: 'Idempotency layer hit/miss/error',
  labelNames: ['layer', 'result'],
  registers: [registry],
});

export const mPayments = new Counter({
  name: 'tg_payments_total',
  help: 'Mock payment outcomes',
  labelNames: ['status', 'replayed'],
  registers: [registry],
});

export const mChaos = new Counter({
  name: 'tg_chaos_triggered_total',
  help: 'Chaos injections fired',
  labelNames: ['mode'],
  registers: [registry],
});

export const mSweeperRuns = new Counter({
  name: 'tg_sweeper_runs_total',
  help: 'Sweeper invocations',
  labelNames: ['skipped'],
  registers: [registry],
});

// --- Histograms -------------------------------------------------------------

export const mHttpDuration = new Histogram({
  name: 'tg_http_request_duration_seconds',
  help: 'Request duration by route + status',
  labelNames: ['route', 'status'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

// --- Gauges -----------------------------------------------------------------

export const mQueueDepth = new Gauge({
  name: 'tg_queue_depth',
  help: 'QStash pending message count',
  labelNames: ['queue'],
  registers: [registry],
});

export const mSeatsRemaining = new Gauge({
  name: 'tg_seats_remaining',
  help: 'Available seats per train',
  labelNames: ['train_id'],
  registers: [registry],
});

export const mBreakerState = new Gauge({
  name: 'tg_breaker_state',
  help: '0=closed, 1=half-open, 2=open',
  labelNames: ['dep'],
  registers: [registry],
});

export const mDbPoolUtil = new Gauge({
  name: 'tg_db_pool_utilization_ratio',
  help: 'Supavisor pool utilization (approximate)',
  registers: [registry],
});

// --- Typed record helpers ---------------------------------------------------
// Back-compat with the Phase 2 stub signature so existing call sites compile.

type Labels = Record<string, string | number | undefined>;

function cleanLabels(labels: Labels | undefined): Record<string, string> {
  if (!labels) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    if (v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

const counterByName: Record<string, Counter<string>> = {
  tg_booking_requests_total: mBookingRequests,
  tg_admissions_total: mAdmissions,
  tg_rejections_total: mRejections,
  tg_allocations_total: mAllocations,
  tg_retries_total: mRetries,
  tg_dlq_total: mDlq,
  tg_cache_hits_total: mCacheHits,
  tg_idempotency_cache_hit_total: mIdemCacheHits,
  tg_payments_total: mPayments,
  tg_chaos_triggered_total: mChaos,
  tg_sweeper_runs_total: mSweeperRuns,
};

const histogramByName: Record<string, Histogram<string>> = {
  tg_http_request_duration_seconds: mHttpDuration,
};

const gaugeByName: Record<string, Gauge<string>> = {
  tg_queue_depth: mQueueDepth,
  tg_seats_remaining: mSeatsRemaining,
  tg_breaker_state: mBreakerState,
  tg_db_pool_utilization_ratio: mDbPoolUtil,
};

export const record = {
  counter(name: string, labels?: Labels): void {
    const c = counterByName[name];
    if (!c) return;
    c.inc(cleanLabels(labels));
  },
  observe(name: string, value: number, labels?: Labels): void {
    const h = histogramByName[name];
    if (!h) return;
    h.observe(cleanLabels(labels), value);
  },
  gauge(name: string, value: number, labels?: Labels): void {
    const g = gaugeByName[name];
    if (!g) return;
    g.set(cleanLabels(labels), value);
  },
};
