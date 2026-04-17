// Custom sliding-window-LOG rate limiter — Rule 4.1 ammunition.
//
// Difference vs @upstash/ratelimit's sliding-window-COUNTER (used on the hot
// /api/book path):
//   - Counter is ~97% accurate (Cloudflare's prod measurement). Fast: 1 Redis
//     op per check, O(1) storage.
//   - Log is 100% accurate. Uses a Redis sorted set where every accepted
//     request is one member scored by its timestamp. Eviction by ZREMRANGEBYSCORE.
//     Storage O(N) where N = limit; O(log N) per op.
//
// We use COUNTER for the hot path (throughput matters; 97% is plenty) and LOG
// for admin endpoints (correctness matters; admin rate is 30/min so O(log N)
// cost is irrelevant).
//
// The whole check is ONE EVAL — atomic, no races. The script:
//   1. Drop entries older than `window_ms` from the sorted set.
//   2. If cardinality < limit → ZADD new member, EXPIRE, return allowed.
//   3. Else → compute retry-after from the oldest in-window entry.
// Returns [ok(0|1), remaining, retry_after_ms].

import { redis } from '@/infra/redis/client';
import { logger } from '@/lib/logging/logger';

const SCRIPT = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

-- Step 1: evict anything older than the window start
local window_start = now_ms - window_ms
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Step 2: count what remains
local count = redis.call('ZCARD', key)

if count < limit then
  -- Step 3a: record this hit
  redis.call('ZADD', key, now_ms, member)
  -- TTL one window beyond oldest in case traffic stops and we'd otherwise leak memory
  redis.call('PEXPIRE', key, window_ms * 2)
  return {1, limit - count - 1, 0}
end

-- Step 3b: over limit. Find the oldest in-window timestamp to compute retry-after.
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry_after_ms = window_ms
if #oldest >= 2 then
  retry_after_ms = tonumber(oldest[2]) + window_ms - now_ms
  if retry_after_ms < 0 then retry_after_ms = 0 end
end
return {0, 0, retry_after_ms}
`.trim();

export interface LuaRateLimitOutcome {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  windowSeconds: number;
  degraded: boolean;
}

export interface LuaRateLimitArgs {
  /** Identifier-scoped key. Prefix with the endpoint family for clarity, e.g. "rl:admin:<tok>". */
  key: string;
  /** Max admitted hits in the window. */
  limit: number;
  /** Window in seconds. */
  windowSeconds: number;
}

/**
 * 100%-accurate sliding-window-log via a single Redis EVAL.
 * Fails OPEN on Redis errors — we prefer admission over strict correctness
 * when the cache layer is down; HTTP-layer ADMIN_SECRET still gates access.
 */
export async function luaSlidingWindowLog(
  args: LuaRateLimitArgs,
): Promise<LuaRateLimitOutcome> {
  const now = Date.now();
  const windowMs = args.windowSeconds * 1000;
  // Uniquify members so two hits in the same millisecond don't collapse to one.
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

  try {
    const raw = (await redis.eval(
      SCRIPT,
      [args.key],
      [String(now), String(windowMs), String(args.limit), member],
    )) as [number, number, number];
    const [ok, remaining, retryAfterMs] = raw;
    return {
      success: ok === 1,
      limit: args.limit,
      remaining,
      retryAfterSeconds: Math.max(0, Math.ceil(retryAfterMs / 1000)),
      windowSeconds: args.windowSeconds,
      degraded: false,
    };
  } catch (e: unknown) {
    logger.warn(
      {
        err: e instanceof Error ? e.message : String(e),
        key: args.key,
      },
      'lua_sliding_log_degraded',
    );
    // Fail open: admin endpoints have ADMIN_SECRET as primary gate.
    return {
      success: true,
      limit: args.limit,
      remaining: args.limit,
      retryAfterSeconds: 0,
      windowSeconds: args.windowSeconds,
      degraded: true,
    };
  }
}
