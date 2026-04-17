// Composed Cockatiel policy wrapping the (mock) payment gateway.
// Different thresholds from pg-policy: payment gateways are slower + flakier,
// so we tolerate more latency and retry more aggressively before escalating.
//
// The retry here is app-layer; QStash's own retry sits on top. If all
// Cockatiel attempts fail, the worker decides whether to surface HTTP 500
// (transient → QStash retries) or HTTP 489 Upstash-NonRetryable-Error
// (permanent → DLQ) based on error class + retry-count header.

import {
  ExponentialBackoff,
  SamplingBreaker,
  TimeoutStrategy,
  circuitBreaker,
  handleAll,
  retry,
  timeout,
  wrap,
} from 'cockatiel';

const paymentTimeout = timeout(5000, TimeoutStrategy.Aggressive);

const paymentRetry = retry(handleAll, {
  maxAttempts: 2,
  backoff: new ExponentialBackoff({ initialDelay: 200, maxDelay: 2000 }),
});

const paymentBreaker = circuitBreaker(handleAll, {
  halfOpenAfter: 15_000,
  breaker: new SamplingBreaker({
    threshold: 0.5,
    duration: 10_000,
    minimumRps: 1,
  }),
});

export const paymentPolicy = wrap(paymentTimeout, paymentRetry, paymentBreaker);
