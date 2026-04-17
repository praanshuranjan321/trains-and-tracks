// POST /api/sweeper/expire-holds — scheduled hold reclaim.
// Invoked every 60s by a QStash Schedule; signature verified upstream.
// Under the hood: `sweep_expired_holds()` stored function acquires
// pg_try_advisory_xact_lock(8675309) first, so concurrent runs skip silently.
//
// Response:
//   200 { ok: true, swept: N, skipped: bool }
// On pgPolicy failure (breaker open / timeout): 500 → QStash retries the
// Schedule tick on its own cadence.

import type { NextRequest } from 'next/server';

import { verifySignatureAppRouter } from '@/infra/qstash/verifier';
import { sweepExpiredHolds } from '@/lib/db/repositories/bookings';
import { pgPolicy } from '@/lib/resilience/pg-policy';
import { logger } from '@/lib/logging/logger';
import { record } from '@/lib/metrics/registry';
import { scheduleMetricsPush } from '@/lib/metrics/pusher';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function handler(_req: NextRequest): Promise<Response> {
  scheduleMetricsPush();
  try {
    const result = await pgPolicy.execute(() => sweepExpiredHolds());
    if (result.skipped) {
      logger.info({ swept: 0, skipped: true }, 'sweeper_concurrent_skip');
    } else {
      logger.info({ swept: result.swept_count }, 'sweeper_run');
    }
    record.counter('tg_sweeper_runs_total', {
      skipped: String(result.skipped),
    });
    if (result.swept_count > 0) {
      record.counter('tg_holds_expired_total', undefined);
    }
    return Response.json({
      ok: true,
      swept: result.swept_count,
      skipped: result.skipped,
    });
  } catch (e: unknown) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      'sweeper_failed',
    );
    return new Response(
      JSON.stringify({ error: { code: 'upstream_failure', message: 'sweeper failed' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export const POST = verifySignatureAppRouter(handler);
