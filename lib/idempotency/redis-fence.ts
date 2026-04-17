// Fast-path idempotency fence in Redis: SET key NX EX 60.
// - NX only creates the key if it does NOT already exist (atomic)
// - EX 60 expires after 60 seconds so abandoned keys don't linger forever
//
// This is the FIRST layer of the two-layer idempotency (ADR-005). A replay
// within 60s of the original request is rejected in ~5ms here; after 60s,
// Postgres UNIQUE on idempotency_keys catches anything that slipped through
// (the authoritative 24h store). Fails open if Redis is unreachable —
// correctness is preserved by the Postgres layer either way.

import { redis } from '@/infra/redis/client';
import { logger } from '@/lib/logging/logger';

export interface FenceResult {
  acquired: boolean; // true = first-time request, false = replay
  degraded: boolean; // true = Redis unreachable, we fell through
}

const TTL_SECONDS = 60;

export async function redisFence(args: {
  key: string;
  userId: string;
}): Promise<FenceResult> {
  const cacheKey = `idem:${args.userId}:${args.key}`;
  try {
    // Upstash Redis SET with NX + EX. Returns 'OK' on success, null on conflict.
    const res = await redis.set(cacheKey, '1', { nx: true, ex: TTL_SECONDS });
    return { acquired: res === 'OK', degraded: false };
  } catch (e: unknown) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), key: cacheKey },
      'redis_fence_degraded',
    );
    // Fail open — Postgres layer is authoritative. Return `acquired: false`
    // so caller proceeds to Postgres check (which handles both new + replay).
    return { acquired: false, degraded: true };
  }
}
