// POST /api/book — ingress per API_CONTRACT §5.1.
//
// Pipeline:
//   1. Extract headers (Idempotency-Key required, X-Request-ID optional, IP)
//   2. Parse + Zod-validate body
//   3. Hot-path rate limit (sliding-window, 100/10s per IP) — 429 if over
//   4. Queue-depth backpressure — 503 if over HIGH_WATER
//   5. Request-hash (SHA-256 of canonical JSON body) for Stripe contract
//   6. Redis NX pre-flight (advisory; degrades open)
//   7. Postgres idempotency_check — CTE+UNION, always 1 row
//        a. fresh          → create booking + publish to QStash + cache 202 body
//        b. replay         → return cached status/body + Idempotent-Replayed: true
//        c. hash mismatch  → 400 idempotency_key_in_use
//        d. inflight       → 409 idempotency_key_replaying
//
// Phase 2 scope: the fresh path writes the 202 body to idempotency_keys.response_body
// so replays return 202 + Idempotent-Replayed: true (Stripe contract = replay
// echoes original status). Once the Phase 3 worker confirms, it overwrites that
// row with the 200 CONFIRMED body and subsequent replays return 200.

import { NextRequest, NextResponse } from 'next/server';
import { ulid } from 'ulid';
import { BrokenCircuitError } from 'cockatiel';

import { sql } from '@/lib/db/pg';
import { createBooking } from '@/lib/db/repositories/bookings';
import { BookRequestSchema } from '@/lib/validation/book';
import { computeRequestHash } from '@/lib/idempotency/request-hash';
import { redisFence } from '@/lib/idempotency/redis-fence';
import {
  checkIdempotency,
  commitIdempotencyResponse,
} from '@/lib/idempotency/postgres-authority';
import { rateLimitBook } from '@/lib/admission/rate-limiter';
import { queueDepthGate } from '@/lib/admission/queue-depth-gate';
import {
  rateLimitHeaders,
  retryAfterHeader,
  queueDepthHeader,
} from '@/lib/admission/headers';
import { publishAllocateJob } from '@/infra/qstash/publisher';
import { logger, type Logger } from '@/lib/logging/logger';
import { apiError } from '@/lib/errors/api-error';
import { record } from '@/lib/metrics/registry';
import { scheduleMetricsPush } from '@/lib/metrics/pusher';
import { M } from '@/lib/metrics/names';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Phase 2: hardcode price. Phase 3 fetches from trains table alongside the
// worker's allocation. Value matches seed (₹1260 = 126000 paise).
const PRICE_PAISE = 126000;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'anon';
}

function requestIdOf(req: NextRequest): string {
  const given = req.headers.get('x-request-id');
  if (given && given.length <= 128) return given;
  return `req_${ulid().toLowerCase()}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  scheduleMetricsPush();
  const startNs = performance.now();
  const requestId = requestIdOf(req);
  const ip = clientIp(req);
  const log = logger.child({ request_id: requestId, ip });

  record.counter(M.bookingRequestsTotal, { method: 'POST', route: '/api/book' });

  try {
    return await handle(req, requestId, ip, log, startNs);
  } catch (e: unknown) {
    // Breaker tripped in pgPolicy — fail CLOSED per FAILURE_MATRIX §3.3 /
    // API_CONTRACT §3. 503 + Retry-After: 30 so clients back off; no
    // allocation attempt made. Rate-limit headers omitted here because the
    // breaker path bypasses the earlier admission stage — caller has no
    // per-IP quota info to display.
    if (e instanceof BrokenCircuitError) {
      record.counter(M.rejectionsTotal, { reason: 'circuit_open' });
      log.warn('circuit_open_503');
      return apiError({
        code: 'circuit_open',
        message: 'Downstream temporarily unavailable — retry in 30s',
        status: 503,
        requestId,
        extraHeaders: { 'Retry-After': '30' },
      });
    }
    throw e;
  }
}

async function handle(
  req: NextRequest,
  requestId: string,
  ip: string,
  log: Logger,
  startNs: number,
): Promise<NextResponse> {
  // 1. Idempotency-Key header.
  const idempotencyKey = req.headers.get('idempotency-key');
  if (!idempotencyKey) {
    record.counter(M.rejectionsTotal, { reason: 'idempotency_key_missing' });
    return apiError({
      code: 'idempotency_key_missing',
      message: 'Idempotency-Key header is required on POST /api/book',
      status: 400,
      requestId,
    });
  }
  if (!UUID_V4_RE.test(idempotencyKey)) {
    record.counter(M.rejectionsTotal, { reason: 'idempotency_key_malformed' });
    return apiError({
      code: 'idempotency_key_malformed',
      message: 'Idempotency-Key must be a valid UUIDv4',
      status: 400,
      requestId,
    });
  }

  // 2. Body parse + Zod validation.
  let parsed: unknown;
  try {
    const text = await req.text();
    if (!text) throw new Error('empty body');
    parsed = JSON.parse(text);
  } catch {
    record.counter(M.rejectionsTotal, { reason: 'body_parse_failed' });
    return apiError({
      code: 'invalid_request_body',
      message: 'Request body must be valid JSON',
      status: 400,
      requestId,
    });
  }

  const zres = BookRequestSchema.safeParse(parsed);
  if (!zres.success) {
    record.counter(M.rejectionsTotal, { reason: 'zod_validation' });
    return apiError({
      code: 'invalid_request_body',
      message: 'Request body failed validation',
      status: 400,
      requestId,
      details: { issues: zres.error.issues },
    });
  }
  const body = zres.data;

  // 3. Rate limit (fails open on Redis error).
  const rate = await rateLimitBook(ip);
  const rateHdrs = rateLimitHeaders(rate);
  if (!rate.success) {
    record.counter(M.rejectionsTotal, { reason: 'rate_limit' });
    log.info({ remaining: rate.remaining }, 'rate_limit_exceeded');
    return apiError({
      code: 'rate_limit_exceeded',
      message: `Rate limit exceeded — retry after ${rate.retryAfterSeconds}s`,
      status: 429,
      requestId,
      extraHeaders: {
        ...rateHdrs,
        ...retryAfterHeader(rate.retryAfterSeconds),
      },
    });
  }

  // 4. Queue-depth backpressure (fails open on QStash API error).
  const depth = await queueDepthGate(body.trainId);
  if (depth.overLimit) {
    record.counter(M.rejectionsTotal, { reason: 'backpressure' });
    log.info({ depth: depth.depth }, 'backpressure_503');
    return apiError({
      code: 'backpressure',
      message: 'Queue is at capacity — try again shortly',
      status: 503,
      requestId,
      extraHeaders: {
        ...rateHdrs,
        ...retryAfterHeader(depth.retryAfterSec),
        ...queueDepthHeader(depth.depth),
      },
    });
  }

  // 5. Request hash (for Stripe contract).
  const requestHash = computeRequestHash(body);

  // 6. Redis NX pre-flight — best-effort.
  //    The actual decision comes from Postgres (step 7). This only
  //    short-circuits ~5ms on quick replays when Redis is available.
  const fence = await redisFence({ key: idempotencyKey, userId: ip });
  record.counter(M.idempotencyCacheHitTotal, {
    layer: 'redis',
    result: fence.degraded ? 'error' : fence.acquired ? 'miss' : 'hit',
  });

  // 7. Postgres idempotency_check (authoritative).
  const verdict = await checkIdempotency({
    key: idempotencyKey,
    userId: ip,
    requestHash,
  });

  if (verdict.kind === 'hash_mismatch') {
    record.counter(M.rejectionsTotal, { reason: 'idem_hash_mismatch' });
    return apiError({
      code: 'idempotency_key_in_use',
      message:
        'This Idempotency-Key was used with a different request body. Use a new key or replay the original request unchanged.',
      status: 400,
      requestId,
      extraHeaders: rateHdrs,
    });
  }

  if (verdict.kind === 'replay') {
    record.counter(M.idempotencyCacheHitTotal, { layer: 'postgres', result: 'hit' });
    log.info({ cachedStatus: verdict.status }, 'idempotent_replay');
    return NextResponse.json(verdict.body as object, {
      status: verdict.status,
      headers: {
        'X-Request-ID': requestId,
        'Idempotent-Replayed': 'true',
        ...rateHdrs,
      },
    });
  }

  if (verdict.kind === 'inflight') {
    record.counter(M.rejectionsTotal, { reason: 'idem_inflight' });
    return apiError({
      code: 'idempotency_key_replaying',
      message:
        'An earlier request with this Idempotency-Key is still processing — poll /api/book/:jobId instead of re-posting.',
      status: 409,
      requestId,
      extraHeaders: rateHdrs,
    });
  }

  // verdict.kind === 'fresh' — proceed with the new booking.

  let bookingId: string;
  try {
    const created = await createBooking({
      idempotencyKey,
      trainId: body.trainId,
      passengerName: body.passengerName,
      passengerPhone: body.passengerPhone ?? null,
      pricePaise: PRICE_PAISE,
    });
    bookingId = created.id;
  } catch (e: unknown) {
    // UNIQUE(idempotency_key) race — the 3rd-layer backstop. If we somehow
    // raced another request through steps 6–7, Postgres rejects the duplicate.
    log.error({ err: e instanceof Error ? e.message : String(e) }, 'booking_create_failed');
    return apiError({
      code: 'internal_error',
      message: 'Could not create booking row',
      status: 500,
      requestId,
      extraHeaders: rateHdrs,
    });
  }

  // Publish to QStash. Flow Control key serializes per train at the broker.
  let qstashMessageId: string;
  try {
    const res = await publishAllocateJob({
      bookingId,
      idempotencyKey,
      trainId: body.trainId,
      passengerName: body.passengerName,
    });
    qstashMessageId = res.messageId;
  } catch (e: unknown) {
    const errMessage = e instanceof Error ? e.message : String(e);
    log.error({ err: errMessage, bookingId }, 'qstash_publish_failed');

    // Close the tombstone gap: the booking row exists but nothing will drive
    // it to terminal. Mark it FAILED + cache the 502 response so replays
    // return the same failure. Invariants preserved:
    //   no duplicate — nothing was allocated
    //   no lost intent — row terminal state visible via poll + idempotent replay
    //   no silent hang — client sees explicit 502 within request window
    //
    // Evolution path: transactional outbox pattern (FAILURE_MATRIX §2.1).
    try {
      await sql`
        UPDATE bookings
           SET status = 'FAILED',
               failure_reason = 'upstream_publish_failure',
               updated_at = now()
         WHERE id = ${bookingId}::uuid
           AND status = 'PENDING'
      `;
    } catch (rollbackErr) {
      log.warn(
        { err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr) },
        'booking_rollback_failed',
      );
    }

    const errBody = {
      error: {
        code: 'upstream_failure',
        message: 'Could not enqueue booking for processing',
        request_id: requestId,
        bookingId,
      },
    };
    try {
      await commitIdempotencyResponse({
        key: idempotencyKey,
        status: 502,
        body: errBody,
      });
    } catch (idemErr) {
      log.warn(
        { err: idemErr instanceof Error ? idemErr.message : String(idemErr) },
        'idem_commit_on_publish_failure_failed',
      );
    }

    return apiError({
      code: 'upstream_failure',
      message: 'Could not enqueue booking for processing',
      status: 502,
      requestId,
      extraHeaders: rateHdrs,
    });
  }

  const responseBody = {
    jobId: bookingId,
    pollUrl: `/api/book/${bookingId}`,
    status: 'PENDING' as const,
    trainId: body.trainId,
    estimatedWaitMs: 1800,
  };

  // Cache the 202 body so replays return 202 + Idempotent-Replayed: true
  // until the worker overwrites with the terminal 200 CONFIRMED body.
  await commitIdempotencyResponse({
    key: idempotencyKey,
    status: 202,
    body: responseBody,
  });

  record.counter(M.admissionsTotal, { reason: 'accepted' });
  record.observe(
    M.httpRequestDurationSeconds,
    (performance.now() - startNs) / 1000,
    { route: '/api/book', status: '202' },
  );

  log.info(
    { bookingId, qstashMessageId, trainId: body.trainId },
    'booking_accepted',
  );

  return NextResponse.json(responseBody, {
    status: 202,
    headers: {
      'X-Request-ID': requestId,
      'Idempotent-Replayed': 'false',
      ...rateHdrs,
    },
  });
}
