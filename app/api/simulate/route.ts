// POST /api/simulate — server-side surge generator (ADR-021).
// Fires N synthetic POSTs to /api/book from within Vercel, so demo load
// isn't bottlenecked by venue wifi or client-side fetch concurrency.
//
// Returns 202 immediately; the actual firing happens in waitUntil so the
// response isn't held open for the duration of the surge. A Redis flag
// `simulate:running` de-dupes concurrent /simulate calls (409 simulator_busy).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';

import { requireAdmin } from '@/lib/admin/auth';
import { redis } from '@/infra/redis/client';
import { SimulateRequestSchema } from '@/lib/validation/simulate';
import { apiError } from '@/lib/errors/api-error';
import { logger } from '@/lib/logging/logger';
import { record } from '@/lib/metrics/registry';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Fluid Hobby max

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

async function fireOne(i: number, trainId: string, appUrl: string): Promise<number> {
  const key = crypto.randomUUID();
  try {
    const res = await fetch(`${appUrl}/api/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        // Fake distinct fingerprints so rate limiter buckets each sim user separately.
        'x-forwarded-for': `10.0.0.${(i % 254) + 1}`,
      },
      body: JSON.stringify({
        trainId,
        passengerName: `SimUser-${i}`,
        passengerPhone: '+919876543210',
      }),
    });
    return res.status;
  } catch {
    return 0; // network-level fail
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = `req_${ulid().toLowerCase()}`;
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    const status = auth.errorCode === 'rate_limit_exceeded' ? 429 : 401;
    return apiError({
      code: auth.errorCode!,
      message:
        auth.errorCode === 'rate_limit_exceeded'
          ? 'Admin rate limit exceeded'
          : 'Invalid or missing admin token',
      status,
      requestId,
      extraHeaders:
        auth.retryAfterSeconds !== undefined
          ? { 'Retry-After': String(auth.retryAfterSeconds) }
          : undefined,
    });
  }

  let parsed;
  try {
    parsed = SimulateRequestSchema.safeParse(await req.json());
  } catch {
    return apiError({
      code: 'invalid_request_body',
      message: 'JSON body required',
      status: 400,
      requestId,
    });
  }
  if (!parsed.success) {
    return apiError({
      code: 'invalid_request_body',
      message: 'validation failed',
      status: 400,
      requestId,
      details: { issues: parsed.error.issues },
    });
  }
  const { trainId, requestCount, windowSeconds } = parsed.data;

  // Single-flight: prevent two simulators running at once.
  const simulationId = `sim_${ulid().toLowerCase()}`;
  const claim = await redis.set('simulate:running', simulationId, {
    nx: true,
    ex: windowSeconds + 60, // auto-release if we crash
  });
  if (claim !== 'OK') {
    return apiError({
      code: 'simulator_busy',
      message: 'another simulation is in flight',
      status: 409,
      requestId,
    });
  }

  const appUrl = required('APP_URL');
  const perMs = (windowSeconds * 1000) / requestCount;

  // Fire asynchronously — client gets 202 immediately.
  const fireAll = async () => {
    const t0 = Date.now();
    const results: number[] = [];

    // Chunk into batches of up to 500 concurrent fetches — Node's undici can
    // handle that; beyond we risk FD exhaustion.
    const CHUNK = 500;
    for (let i = 0; i < requestCount; i += CHUNK) {
      const batchSize = Math.min(CHUNK, requestCount - i);
      const batchStart = Date.now();
      const batch = await Promise.all(
        Array.from({ length: batchSize }, (_, j) =>
          fireOne(i + j, trainId, appUrl),
        ),
      );
      results.push(...batch);

      // Pace — if this chunk finished faster than its slice of the window, sleep.
      const targetMs = batchSize * perMs;
      const elapsed = Date.now() - batchStart;
      if (elapsed < targetMs) {
        await new Promise((r) => setTimeout(r, targetMs - elapsed));
      }
    }

    const bucket = new Map<number, number>();
    for (const s of results) bucket.set(s, (bucket.get(s) ?? 0) + 1);
    logger.info(
      {
        simulationId,
        requestCount,
        windowSeconds,
        durationMs: Date.now() - t0,
        distribution: Object.fromEntries(bucket),
      },
      'simulate_complete',
    );
    record.counter('tg_sim_requests_total', {
      train_id: trainId,
      status: 'all',
    });
    await redis.del('simulate:running');
  };

  // Run in background — don't block the response.
  fireAll().catch(async (e) => {
    logger.error(
      { err: e instanceof Error ? e.message : String(e), simulationId },
      'simulate_failed',
    );
    await redis.del('simulate:running').catch(() => {});
  });

  return NextResponse.json(
    {
      simulationId,
      targetRps: Math.round(requestCount / windowSeconds),
      dashboardUrl: '/ops',
    },
    { status: 202, headers: { 'X-Request-ID': requestId } },
  );
}
