// Composed Cockatiel policy wrapping Postgres calls.
//   wrap(timeout, retry, breaker)
// - timeout(2s, aggressive) — cuts the underlying Promise, doesn't wait
// - retry(2 attempts, exp backoff 100ms→1s) — retries transient Postgres errors
// - SamplingBreaker(50% over 10s, minRps 1, halfOpenAfter 30s) — fails CLOSED:
//   clients see 503 circuit_open instead of a hung allocation.
//
// Module-level singleton so breaker state persists across invocations in warm
// Vercel containers. Cold starts reset — acceptable for a hackathon; at scale
// we'd externalize breaker state to Redis.

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

const pgTimeout = timeout(2000, TimeoutStrategy.Aggressive);

const pgRetry = retry(handleAll, {
  maxAttempts: 2,
  backoff: new ExponentialBackoff({ initialDelay: 100, maxDelay: 1000 }),
});

const pgBreaker = circuitBreaker(handleAll, {
  halfOpenAfter: 30_000,
  breaker: new SamplingBreaker({
    threshold: 0.5,
    duration: 10_000,
    minimumRps: 1,
  }),
});

export const pgPolicy = wrap(pgTimeout, pgRetry, pgBreaker);

// Read-only inspector for /api/healthz and metrics (tg_breaker_state).
export function pgBreakerState(): 'closed' | 'half-open' | 'open' {
  const state = pgBreaker.state;
  if (state === 0) return 'closed';
  if (state === 1) return 'half-open';
  return 'open';
}
