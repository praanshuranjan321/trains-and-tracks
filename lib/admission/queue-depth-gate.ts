// Queue-depth backpressure: if the QStash pending-message count for this
// train's Flow Control key exceeds HIGH_WATER, refuse new /api/book calls
// with 503 + Retry-After + X-Queue-Depth. Keeps the ingress honest instead
// of letting clients hang on saturated queues.
//
// QStash's /v2/queues reports per-FC-key state. We cache 5s in Redis so the
// hot path doesn't hit Upstash API on every request.

import { redis } from '@/infra/redis/client';
import { logger } from '@/lib/logging/logger';

const HIGH_WATER = 2000;
const CACHE_TTL_SECONDS = 5;
const ESTIMATED_MS_PER_JOB = 10; // 100 jobs/s per train → ~10ms each

export interface DepthCheck {
  overLimit: boolean;
  depth: number;
  retryAfterSec: number;
  degraded: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

async function fetchQueueDepth(flowControlKey: string): Promise<number> {
  // Upstash QStash /v2/queues returns all queues. A per-key depth isn't
  // directly exposed for Flow Control keys (those share the single queue).
  // Best proxy: sum of `lag` across all queues for our token, or fall back
  // to reading the single queue depth. For the hackathon we read queue list
  // and sum pending counts.
  const res = await fetch('https://qstash.upstash.io/v2/queues', {
    headers: { Authorization: `Bearer ${required('QSTASH_TOKEN')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`qstash /v2/queues → ${res.status}`);
  const data = (await res.json()) as Array<{ name: string; lag?: number }>;
  let total = 0;
  for (const q of data) {
    if (typeof q.lag === 'number') total += q.lag;
  }
  // Flow Control keys attribute lag to the default queue; until QStash exposes
  // per-FC-key lag we use the global figure as the signal.
  void flowControlKey;
  return total;
}

export async function queueDepthGate(trainId: string): Promise<DepthCheck> {
  const flowControlKey = `train:${trainId}`;
  const cacheKey = `qdepth:${flowControlKey}`;

  // Cache first.
  let depth: number | null = null;
  try {
    const cached = await redis.get<number>(cacheKey);
    if (typeof cached === 'number') depth = cached;
  } catch (e: unknown) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'qdepth_cache_read_failed');
  }

  if (depth === null) {
    try {
      depth = await fetchQueueDepth(flowControlKey);
      // Fire-and-forget cache write; errors here don't block admission.
      redis
        .set(cacheKey, depth, { ex: CACHE_TTL_SECONDS })
        .catch((e) =>
          logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'qdepth_cache_write_failed'),
        );
    } catch (e: unknown) {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e), flowControlKey },
        'qdepth_probe_failed',
      );
      return { overLimit: false, depth: 0, retryAfterSec: 0, degraded: true };
    }
  }

  if (depth > HIGH_WATER) {
    const retryAfterSec = Math.max(1, Math.ceil((depth * ESTIMATED_MS_PER_JOB) / 1000));
    return { overLimit: true, depth, retryAfterSec, degraded: false };
  }

  return { overLimit: false, depth, retryAfterSec: 0, degraded: false };
}
