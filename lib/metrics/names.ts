// Canonical metric names per PRD §5.5. The Prometheus registry wiring lives
// in Phase 5; for Phase 2 we expose the names for call-site consistency and
// provide a no-op recorder so handlers compile and run.

export const M = {
  bookingRequestsTotal: 'tg_booking_requests_total',
  admissionsTotal: 'tg_admissions_total',
  rejectionsTotal: 'tg_rejections_total',
  allocationsTotal: 'tg_allocations_total',
  retriesTotal: 'tg_retries_total',
  dlqTotal: 'tg_dlq_total',
  httpRequestDurationSeconds: 'tg_http_request_duration_seconds',
  dbPoolUtilizationRatio: 'tg_db_pool_utilization_ratio',
  cacheHitsTotal: 'tg_cache_hits_total',
  seatsRemaining: 'tg_seats_remaining',
  breakerState: 'tg_breaker_state',
  idempotencyCacheHitTotal: 'tg_idempotency_cache_hit_total',
  queueDepth: 'tg_queue_depth',
  paymentsTotal: 'tg_payments_total',
  chaosTriggeredTotal: 'tg_chaos_triggered_total',
} as const;

export type MetricName = (typeof M)[keyof typeof M];
