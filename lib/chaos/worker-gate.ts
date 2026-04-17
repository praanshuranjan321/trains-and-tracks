// Chaos injection for the worker. /api/admin/kill-worker writes a Redis
// counter (chaos:worker:fail-next = {remaining, mode}); this helper
// decrements + throws the chosen failure at the top of the worker pipeline.
//
// Supported modes per API_CONTRACT §7.3:
//   'timeout' — sleep past maxDuration (60s) so Vercel kills the invocation
//   '500'     — throw WorkerChaosError → worker returns HTTP 500 (QStash retries)
//   'crash'   — synchronous throw before any work (same effect as 500 here)

import { redis } from '@/infra/redis/client';
import { logger } from '@/lib/logging/logger';

export class WorkerChaosError extends Error {
  readonly mode: 'timeout' | '500' | 'crash';
  constructor(mode: 'timeout' | '500' | 'crash') {
    super(`chaos: ${mode}`);
    this.name = 'WorkerChaosError';
    this.mode = mode;
  }
}

interface ChaosState {
  remaining: number;
  mode: 'timeout' | '500' | 'crash';
}

/**
 * Read the chaos flag. If remaining > 0, decrement (or delete) and trigger
 * the failure mode. Returns void on no-op; throws WorkerChaosError otherwise.
 * Fails safe: any Redis error skips chaos (availability over test fidelity).
 */
export async function maybeInjectChaos(): Promise<void> {
  let state: ChaosState | null = null;
  try {
    // Upstash REST client parses JSON strings automatically for set() with
    // structured value, but returns stringified JSON from get() in some
    // paths. Handle both.
    const raw = await redis.get<ChaosState | string>('chaos:worker:fail-next');
    if (raw == null) return;
    state = typeof raw === 'string' ? (JSON.parse(raw) as ChaosState) : raw;
  } catch (e: unknown) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      'chaos_flag_read_failed',
    );
    return;
  }

  if (!state || state.remaining <= 0) return;

  // Decrement or delete atomically. Best-effort — if Redis write fails we
  // may fire chaos one extra time; acceptable for a demo affordance.
  try {
    if (state.remaining <= 1) {
      await redis.del('chaos:worker:fail-next');
    } else {
      await redis.set(
        'chaos:worker:fail-next',
        JSON.stringify({ remaining: state.remaining - 1, mode: state.mode }),
        { ex: 60 },
      );
    }
  } catch (e: unknown) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      'chaos_flag_write_failed',
    );
  }

  logger.warn({ mode: state.mode, remaining: state.remaining }, 'chaos_fired');

  if (state.mode === 'timeout') {
    // Sleep 70s — worker maxDuration is 60s, Vercel will kill us.
    await new Promise((r) => setTimeout(r, 70_000));
  }
  // '500' and 'crash' both surface as a thrown WorkerChaosError that the
  // handler catches and maps to HTTP 500.
  throw new WorkerChaosError(state.mode);
}
