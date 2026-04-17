// POST /api/admin/kill-worker — chaos trigger for the demo.
// Writes a Redis flag that the worker reads at pipeline start; when set,
// the worker decrements and throws the chosen failureMode. Demonstrates
// QStash retry + idempotency idempotently absorbing worker crashes.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';

import { requireAdmin } from '@/lib/admin/auth';
import { redis } from '@/infra/redis/client';
import { KillWorkerSchema } from '@/lib/validation/chaos';
import { apiError } from '@/lib/errors/api-error';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const maxDuration = 15;

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
    parsed = KillWorkerSchema.safeParse(await req.json());
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
  const { failNextN, failureMode } = parsed.data;

  await redis.set(
    'chaos:worker:fail-next',
    JSON.stringify({ remaining: failNextN, mode: failureMode }),
    { ex: 60 },
  );

  logger.warn({ failNextN, failureMode }, 'chaos_armed');

  return NextResponse.json(
    { ok: true, willFailNextN: failNextN, failureMode, ttlSeconds: 60 },
    { headers: { 'X-Request-ID': requestId } },
  );
}
