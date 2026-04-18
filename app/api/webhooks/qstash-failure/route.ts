// POST /api/webhooks/qstash-failure — DLQ mirror.
// QStash fires this as the `failureCallback` for every message that exhausts
// its retries OR receives HTTP 489 Upstash-NonRetryable-Error. We persist
// a row in dlq_jobs so /ops/dlq can render the backlog without hitting
// Upstash API on every refresh.
//
// Body shape (per Upstash docs):
//   {
//     status: number,
//     header: { Upstash-Message-Id: [..], ... },
//     body: base64(originalPayload),
//     retried: number,
//     sourceMessageId: string,
//   }

import type { NextRequest } from 'next/server';

import { verifySignatureAppRouter } from '@/infra/qstash/verifier';
import { insertDlqJob } from '@/lib/db/repositories/dlq';
import { releaseHoldTerminally } from '@/lib/allocation/hold-state-machine';
import { commitIdempotencyResponse } from '@/lib/idempotency/postgres-authority';
import { logger } from '@/lib/logging/logger';
import { record } from '@/lib/metrics/registry';
import { M } from '@/lib/metrics/names';

export const runtime = 'nodejs';
export const maxDuration = 15;

interface QStashFailureBody {
  status?: number;
  header?: Record<string, string[] | string | undefined>;
  body?: string;
  retried?: number;
  sourceMessageId?: string;
}

function decodeBase64Json(b64: string): unknown {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return { _raw: b64.slice(0, 200) };
  }
}

function headerOne(
  header: QStashFailureBody['header'],
  key: string,
): string | undefined {
  const v = header?.[key];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

async function handler(req: NextRequest): Promise<Response> {
  let body: QStashFailureBody;
  try {
    body = (await req.json()) as QStashFailureBody;
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      'dlq_webhook_parse_failed',
    );
    return new Response('bad body', { status: 400 });
  }

  const sourceMessageId =
    body.sourceMessageId ??
    headerOne(body.header, 'Upstash-Message-Id') ??
    headerOne(body.header, 'upstash-message-id');

  if (!sourceMessageId) {
    logger.warn({ body }, 'dlq_webhook_missing_message_id');
    return new Response('missing message id', { status: 400 });
  }

  const payload = body.body ? decodeBase64Json(body.body) : null;
  const errorReason =
    body.status !== undefined
      ? `retries_exhausted_http_${body.status}`
      : 'retries_exhausted';

  try {
    const inserted = await insertDlqJob({
      qstashMessageId: sourceMessageId,
      payload,
      errorReason,
      attemptCount: body.retried ?? 0,
    });
    logger.info(
      {
        qstash_message_id: sourceMessageId,
        retried: body.retried,
        deduplicated: inserted === null,
      },
      'dlq_webhook_recorded',
    );
    record.counter(M.dlqTotal, { reason: errorReason });

    // Safety-net cleanup: if the worker returned 489 it already marked the
    // booking FAILED. But if QStash exhausted retries against 500 responses,
    // the worker never went terminal — the booking is still PENDING and the
    // seat may still be held. release_hold_terminal is idempotent, so calling
    // it on both paths is safe and closes the tombstone gap.
    const jobPayload = payload as
      | { bookingId?: string; idempotencyKey?: string; trainId?: string; passengerName?: string }
      | null;
    if (jobPayload?.bookingId && jobPayload.idempotencyKey) {
      try {
        await releaseHoldTerminally({
          bookingId: jobPayload.bookingId,
          reason:
            errorReason === 'retries_exhausted_http_489'
              ? 'payment_failed'
              : 'retries_exhausted',
        });
        await commitIdempotencyResponse({
          key: jobPayload.idempotencyKey,
          status: 200,
          body: {
            jobId: jobPayload.bookingId,
            status: 'FAILED',
            failureReason:
              errorReason === 'retries_exhausted_http_489'
                ? 'payment_failed'
                : 'retries_exhausted',
            trainId: jobPayload.trainId ?? null,
          },
        });
      } catch (cleanupErr: unknown) {
        // Don't fail the webhook on cleanup error — DLQ row is still useful.
        logger.warn(
          {
            err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            booking_id: jobPayload.bookingId,
          },
          'dlq_webhook_cleanup_failed',
        );
      }
    } else {
      logger.warn({ sourceMessageId }, 'dlq_webhook_missing_booking_payload');
    }

    return Response.json({ ok: true, dlqJobId: inserted?.id ?? null });
  } catch (e: unknown) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e), sourceMessageId },
      'dlq_webhook_insert_failed',
    );
    // Return 500 so QStash retries the failure callback itself.
    return new Response('insert failed', { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
