// POST /api/admin/reset — nuke demo state between runs.
// Order matters — seats' CHECK constraint requires booking_id NULL for AVAILABLE
// but NOT NULL for RESERVED/CONFIRMED. So: flip all seats to AVAILABLE first
// (one atomic UPDATE zeroes booking_id/held_until), then cascade the deletes.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ulid } from 'ulid';

import { requireAdmin } from '@/lib/admin/auth';
import { sql } from '@/lib/db/pg';
import { ResetSchema } from '@/lib/validation/reset';
import { apiError } from '@/lib/errors/api-error';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
    parsed = ResetSchema.safeParse(await req.json());
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
      message: 'validation failed; need {confirm:"reset",trainId:"..."}',
      status: 400,
      requestId,
      details: { issues: parsed.error.issues },
    });
  }
  const { trainId } = parsed.data;

  // Seats first (constraint-safe), then the referencing rows.
  const [seatsRes] = await sql<{ n: number }[]>`
    WITH updated AS (
      UPDATE seats
         SET status='AVAILABLE',
             booking_id = NULL,
             held_by = NULL,
             held_until = NULL,
             version = 0,
             updated_at = now()
       WHERE train_id = ${trainId}
       RETURNING id
    )
    SELECT COUNT(*)::int AS n FROM updated
  `;

  const [bookingsRes] = await sql<{ n: number }[]>`
    WITH del AS (
      DELETE FROM bookings WHERE train_id = ${trainId} RETURNING id
    )
    SELECT COUNT(*)::int AS n FROM del
  `;

  const [paymentsRes] = await sql<{ n: number }[]>`
    WITH del AS (
      DELETE FROM payments RETURNING id
    )
    SELECT COUNT(*)::int AS n FROM del
  `;

  const [idemRes] = await sql<{ n: number }[]>`
    WITH del AS (
      DELETE FROM idempotency_keys
       WHERE created_at > now() - interval '1 hour'
       RETURNING idempotency_key
    )
    SELECT COUNT(*)::int AS n FROM del
  `;

  const [dlqRes] = await sql<{ n: number }[]>`
    WITH del AS (
      DELETE FROM dlq_jobs WHERE resolved_at IS NULL RETURNING id
    )
    SELECT COUNT(*)::int AS n FROM del
  `;

  logger.warn(
    {
      trainId,
      seats: seatsRes!.n,
      bookings: bookingsRes!.n,
      payments: paymentsRes!.n,
      idempotencyKeys: idemRes!.n,
      dlq: dlqRes!.n,
    },
    'admin_reset',
  );

  return NextResponse.json(
    {
      ok: true,
      reset: {
        seats: seatsRes!.n,
        bookings: bookingsRes!.n,
        payments: paymentsRes!.n,
        idempotencyKeys: idemRes!.n,
        dlq: dlqRes!.n,
      },
    },
    { headers: { 'X-Request-ID': requestId } },
  );
}
