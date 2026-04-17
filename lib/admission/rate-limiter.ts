// Hot-path rate limiter for POST /api/book.
// @upstash/ratelimit's sliding-window-counter: ~97% accurate per Cloudflare's
// production measurement, one Redis EVAL per check, no hot-spotting.
// Fails OPEN if Redis is unreachable (availability > strict admission —
// Postgres UNIQUE still catches any resulting duplicates).

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/infra/redis/client';
import { logger } from '@/lib/logging/logger';

const WINDOW = '10 s' as const;
const LIMIT = 100;

// One limiter instance per module — shared across invocations in warm Vercel
// containers. The ephemeralCache option absorbs sub-10ms retries without a
// Redis round-trip.
const bookLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
  prefix: 'rl:book',
  analytics: false,
  ephemeralCache: new Map(),
});

export interface RateLimitOutcome {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
  windowSeconds: number;
  degraded: boolean;
}

export async function rateLimitBook(identifier: string): Promise<RateLimitOutcome> {
  try {
    const r = await bookLimiter.limit(identifier);
    const resetSec = Math.max(0, Math.ceil((r.reset - Date.now()) / 1000));
    return {
      success: r.success,
      limit: LIMIT,
      remaining: r.remaining,
      resetSeconds: resetSec,
      retryAfterSeconds: r.success ? 0 : resetSec,
      windowSeconds: 10,
      degraded: false,
    };
  } catch (e: unknown) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), identifier },
      'rate_limit_failed_open',
    );
    return {
      success: true,
      limit: LIMIT,
      remaining: LIMIT,
      resetSeconds: 0,
      retryAfterSeconds: 0,
      windowSeconds: 10,
      degraded: true,
    };
  }
}
