// POST /api/admin/dlq/[id]/retry — re-publish a DLQ payload to QStash.
// Uses the original payload stored in dlq_jobs; sets deduplicationId so a
// double-click doesn't double-enqueue. Marks retried_at on success.
//
// v16 note: dynamic `params` is a Promise — await it before use.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';

import { requireAdmin } from '@/lib/admin/auth';
import { getDlqJobById, markDlqRetried } from '@/lib/db/repositories/dlq';
import { publishAllocateJob } from '@/infra/qstash/publisher';
import { AllocateJobSchema } from '@/lib/validation/worker';
import { apiError } from '@/lib/errors/api-error';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id } = await params;
  const row = await getDlqJobById(id);
  if (!row) {
    return apiError({
      code: 'job_not_found',
      message: 'dlq job not found',
      status: 404,
      requestId,
    });
  }

  // Rehydrate payload into a typed allocate-job. DLQ webhook might have stored
  // payload from a different shape (worker or other endpoint) in future — for
  // now we only know /api/worker/allocate bodies, so reject anything else.
  const parsed = AllocateJobSchema.safeParse(row.payload);
  if (!parsed.success) {
    return apiError({
      code: 'invalid_request_body',
      message: 'stored DLQ payload failed worker schema validation',
      status: 400,
      requestId,
      details: { issues: parsed.error.issues },
    });
  }

  try {
    const res = await publishAllocateJob(parsed.data);
    await markDlqRetried(id);
    return NextResponse.json(
      { ok: true, newMessageId: res.messageId, status: 'requeued' },
      { headers: { 'X-Request-ID': requestId } },
    );
  } catch (e: unknown) {
    return apiError({
      code: 'upstream_failure',
      message:
        'QStash republish failed: ' +
        (e instanceof Error ? e.message : String(e)),
      status: 502,
      requestId,
    });
  }
}
