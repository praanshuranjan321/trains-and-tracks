// GET /api/admin/dlq — list unresolved DLQ jobs (operator mirror).
// Auth: Bearer ADMIN_SECRET. Limited to 30/min via custom Lua log.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';

import { requireAdmin } from '@/lib/admin/auth';
import { listUnresolvedDlq } from '@/lib/db/repositories/dlq';
import { apiError } from '@/lib/errors/api-error';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

  const jobs = await listUnresolvedDlq(limit);
  return NextResponse.json(
    {
      jobs: jobs.map((j) => ({
        id: j.id,
        qstashMessageId: j.qstash_message_id,
        payload: j.payload,
        errorReason: j.error_reason,
        attemptCount: j.attempt_count,
        createdAt: j.created_at,
        retriedAt: j.retried_at,
        resolved: j.resolved_at !== null,
      })),
      total: jobs.length,
    },
    { headers: { 'X-Request-ID': requestId } },
  );
}
