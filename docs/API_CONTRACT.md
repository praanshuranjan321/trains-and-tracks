# Trains and Tracks — API Contract

**Version:** 1.0 · **Status:** Draft · **Date:** 2026-04-17

---

## 1. Design Principles

- **REST-ish**, not dogmatic. Noun-based resources (`/book`, `/seats`, `/admin/dlq`); actions via HTTP verbs or explicit action suffixes (`/admin/kill-worker`).
- **JSON-only** bodies and responses. `Content-Type: application/json` mandatory on POSTs.
- **Idempotency-Key mandatory on all write POSTs** (Stripe contract). Missing → HTTP 400.
- **No API versioning prefix** (`/v1/`) — a 17-hour build has no v2 concern. Would add at Stage 2.
- **Every response has `X-Request-ID`** for log correlation (`req_<ulid>`).
- **Every error response uses RFC-7807-ish shape:**
  ```json
  { "error": { "code": "idempotency_key_in_use", "message": "Human message", "details": {}, "request_id": "req_xyz" } }
  ```
- **Success bodies never wrap in `data`.** `{ "jobId": "...", "status": "..." }` not `{ "data": { "jobId": "..." } }`.
- **Rate limit headers on every response** that passed through the limiter (both IETF draft-10 and legacy).

---

## 2. Common Headers

### Request headers (client -> server)

| Header | Required on | Purpose |
|---|---|---|
| `Content-Type: application/json` | All POSTs | Mandatory |
| `Idempotency-Key: <UUIDv4>` | `POST /api/book`, `POST /api/admin/dlq/:id/retry` | Stripe contract (primary key) |
| `X-Request-ID: <ulid>` | Optional | Client-supplied correlation; server overrides if absent or malformed |
| `Authorization: Bearer <ADMIN_SECRET>` | All `/api/admin/*` | Operator access control |
| `Upstash-Signature: <JWT>` | `/api/worker/*`, `/api/sweeper/*` | QStash-injected; `verifySignatureAppRouter` checks against raw body |

### Response headers (server -> client)

| Header | On | Purpose |
|---|---|---|
| `X-Request-ID: req_<ulid>` | All responses | Log correlation |
| `Idempotent-Replayed: true` | `/api/book` replay | Indicates this response was cached from a prior call |
| `RateLimit-Policy: "sliding";q=100;w=10` | All rate-limited endpoints | IETF draft-10 format (identifies quota and window) |
| `RateLimit: "sliding";r=87;t=7` | All rate-limited endpoints | Current remaining + reset time |
| `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | All rate-limited endpoints | Legacy format (for compat) |
| `Retry-After: <seconds>` | 429 + 503 | Client backoff hint (integer seconds) |
| `X-Queue-Depth: <number>` | 503 (backpressure) | Rendered as queue position |
| `Upstash-NonRetryable-Error: true` | 489 (worker->QStash) | Signals QStash to skip retry, go to DLQ |

---

## 3. Error Code Reference

All `error.code` values — canonical list:

| Code | HTTP | When emitted |
|---|---|---|
| `invalid_request_body` | 400 | Zod validation failed |
| `idempotency_key_missing` | 400 | POST without `Idempotency-Key` header |
| `idempotency_key_malformed` | 400 | Not UUIDv4 |
| `idempotency_key_in_use` | 400 | Same key, different canonical-JSON hash |
| `idempotency_key_replaying` | 409 | Same key, original request still in flight |
| `rate_limit_exceeded` | 429 | Sliding-window limit hit |
| `backpressure` | 503 | Queue depth > high-water |
| `circuit_open` | 503 | Downstream breaker tripped |
| `upstream_failure` | 502 | QStash / Supabase / Redis reachable but erroring |
| `internal_error` | 500 | Unexpected exception (caught by error boundary) |
| `invalid_qstash_signature` | 401 | `verifySignatureAppRouter` rejected |
| `admin_unauthorized` | 401 | Missing/wrong `Authorization` on admin routes |
| `job_not_found` | 404 | Poll for unknown `jobId` |
| `sold_out` | 200 (body-level) | Allocation returned 0 rows; booking.status=FAILED |
| `hold_expired` | 200 (body-level) | Sweeper released hold before worker confirmed |
| `payment_failed` | 200 (body-level) | Mock payment returned failure after all retries |
| `simulator_busy` | 409 | `/api/simulate` already running |

**Convention:** operational states (sold_out, hold_expired, payment_failed) return HTTP 200 with `status: FAILED` in body — the HTTP call succeeded, the domain operation did not. Protocol errors return 4xx/5xx.

---

## 4. Endpoint Catalog

| # | Method | Path | Runtime | Auth | Purpose |
|---|---|---|---|---|---|
| 1 | POST | `/api/book` | Node | None | Create booking (ingress) |
| 2 | GET | `/api/book/[jobId]` | Edge | None | Poll booking status |
| 3 | GET | `/api/book/[jobId]/stream` | Edge | None | SSE live status (P1) |
| 4 | GET | `/api/trains` | Edge | None | List trains |
| 5 | GET | `/api/seats` | Edge | None | List seat inventory |
| 6 | POST | `/api/simulate` | Node | Admin | Fire surge (100K req <=10s) |
| 7 | POST | `/api/worker/allocate` | Node | QStash sig | Async seat allocation |
| 8 | POST | `/api/sweeper/expire-holds` | Node | QStash sig | Scheduled hold release |
| 9 | POST | `/api/webhooks/qstash-failure` | Node | QStash sig | DLQ mirror write |
| 10 | GET | `/api/admin/dlq` | Node | Admin | List DLQ |
| 11 | POST | `/api/admin/dlq/[id]/retry` | Node | Admin | Manual retry |
| 12 | POST | `/api/admin/kill-worker` | Node | Admin | Chaos demo |
| 13 | POST | `/api/admin/reset` | Node | Admin | Reset demo state |
| 14 | GET | `/api/healthz` | Edge | None | Health probe |
| 15 | GET | `/api/insights/[metric]` | Edge | None | Grafana proxy for Recharts |

---

## 5. Public Endpoints

### 5.1 `POST /api/book` — ingress

**Runtime:** Node (Postgres + QStash publish).
**Rate limit:** sliding-window 100/10s per user-identifier (IP, or first-party fingerprint).
**Backpressure threshold:** queue-depth > 2000 -> 503.

#### Request

```http
POST /api/book HTTP/1.1
Content-Type: application/json
Idempotency-Key: 3fa85f64-5717-4562-b3fc-2c963f66afa6

{
  "trainId": "12951",
  "passengerName": "Rahul Sharma",
  "passengerPhone": "+919876543210"
}
```

**Zod schema (`lib/validation/book.ts`):**

```ts
export const BookRequestSchema = z.object({
  trainId: z.string().min(1).max(20),
  passengerName: z.string().min(1).max(100).trim(),
  passengerPhone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/)
    .optional(),
});
export type BookRequest = z.infer<typeof BookRequestSchema>;
```

#### Response — 202 Accepted (new booking enqueued)

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
X-Request-ID: req_01HQ7...
Idempotent-Replayed: false
RateLimit-Policy: "sliding";q=100;w=10
RateLimit: "sliding";r=87;t=7

{
  "jobId": "01HQ7F8R3NX...",
  "pollUrl": "/api/book/01HQ7F8R3NX...",
  "status": "PENDING",
  "trainId": "12951",
  "estimatedWaitMs": 1800
}
```

#### Response — 200 OK (idempotent replay, confirmed)

```http
HTTP/1.1 200 OK
Idempotent-Replayed: true

{
  "jobId": "01HQ7F8R3NX...",
  "status": "CONFIRMED",
  "seatId": "T12951-C03-14",
  "passengerName": "Rahul Sharma",
  "pricePaise": 126000,
  "confirmedAt": "2026-04-18T04:30:15.123Z"
}
```

#### Error responses

| HTTP | Body `error.code` | When |
|---|---|---|
| 400 | `idempotency_key_missing` | Header not present |
| 400 | `idempotency_key_malformed` | Not UUIDv4 |
| 400 | `idempotency_key_in_use` | Same key, different `request_hash` |
| 400 | `invalid_request_body` | Zod validation failed; `details` has field-level errors |
| 409 | `idempotency_key_replaying` | Same key, original still PENDING |
| 429 | `rate_limit_exceeded` | Over 100/10s |
| 503 | `backpressure` | Queue depth > 2000 |
| 503 | `circuit_open` | Postgres breaker tripped |
| 500 | `internal_error` | Unexpected |

#### Example cURL

```bash
curl -i -X POST https://trains-and-tracks.vercel.app/api/book \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"trainId":"12951","passengerName":"Rahul Sharma","passengerPhone":"+919876543210"}'
```

#### Idempotency behavior (Stripe contract)

1. Client sends `Idempotency-Key` -> server computes `request_hash = sha256(canonical_json(body))`.
2. Redis `SET NX EX 60 idem:<user>:<key>` — if nil returned, replay.
3. On replay: Postgres `idempotency_keys` lookup. If `request_hash` matches -> return cached response with `Idempotent-Replayed: true`. If hash mismatches -> HTTP 400 `idempotency_key_in_use`.
4. On new: CTE+UNION insert, publish to QStash, write response back to row after worker completes.

---

### 5.2 `GET /api/book/[jobId]` — poll

**Runtime:** Edge (Postgres via PostgREST/supabase-js HTTPS — Edge-compatible).
**Rate limit:** None (client polling pattern).

#### Request

```http
GET /api/book/01HQ7F8R3NX... HTTP/1.1
```

#### Response — 200 OK

```http
HTTP/1.1 200 OK

{
  "jobId": "01HQ7F8R3NX...",
  "status": "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED",
  "queuedAt": "2026-04-18T04:30:01.412Z",
  "confirmedAt": "2026-04-18T04:30:15.123Z" | null,
  "seatId": "T12951-C03-14" | null,
  "pricePaise": 126000,
  "failureReason": "sold_out" | "payment_failed" | "hold_expired" | null
}
```

#### Error responses

| HTTP | Body `error.code` | When |
|---|---|---|
| 404 | `job_not_found` | Unknown `jobId` |

---

### 5.3 `GET /api/book/[jobId]/stream` — SSE (P1)

**Runtime:** Edge (streaming).
**Purpose:** live status without client polling cadence. Caps at 60 iterations (60s) per dossier §11 Vercel stream limits.

```http
GET /api/book/01HQ7F8R3NX.../stream HTTP/1.1
Accept: text/event-stream
```

Response is `text/event-stream`:

```
data: {"status":"PENDING","queuePosition":342}

data: {"status":"PENDING","queuePosition":156}

data: {"status":"CONFIRMED","seatId":"T12951-C03-14"}

```

Stream closes after first terminal state (CONFIRMED/FAILED/EXPIRED) or 60s timeout.

---

### 5.4 `GET /api/trains` — list trains

**Runtime:** Edge. Cached: `Cache-Control: public, max-age=60`.

```http
GET /api/trains HTTP/1.1
```

```json
{
  "trains": [
    {
      "id": "12951",
      "name": "Mumbai Rajdhani Express",
      "source": "New Delhi",
      "destination": "Mumbai Central",
      "departureTime": "16:35",
      "tatkalOpensAt": "2026-04-18T04:30:00Z",
      "totalSeats": 500,
      "basePricePaise": 126000
    }
  ]
}
```

---

### 5.5 `GET /api/seats` — inventory

**Runtime:** Edge.
**Query params:** `train_id` (required).
**Cache:** 1s SWR at edge to absorb polling from seat grid.

```http
GET /api/seats?train_id=12951 HTTP/1.1
```

```json
{
  "trainId": "12951",
  "total": 500,
  "available": 347,
  "reserved": 12,
  "confirmed": 141,
  "seats": [
    { "id": "T12951-C01-01", "coach": "C01", "seatNumber": "01", "status": "CONFIRMED" },
    { "id": "T12951-C01-02", "coach": "C01", "seatNumber": "02", "status": "AVAILABLE" }
  ]
}
```

Full array (500 entries) acceptable because seat-grid UI needs all of them.

---

### 5.6 `POST /api/simulate` — surge fire

**Runtime:** Node. **Auth:** admin token.
**Purpose:** Demo-time surge. Fires N parallel `POST /api/book` server-side (so demo network latency is irrelevant).

```http
POST /api/simulate HTTP/1.1
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{
  "trainId": "12951",
  "requestCount": 100000,
  "windowSeconds": 10
}
```

```ts
export const SimulateRequestSchema = z.object({
  trainId: z.string().min(1),
  requestCount: z.number().int().positive().max(100_000),
  windowSeconds: z.number().int().positive().max(60),
});
```

Response — 202 Accepted:

```json
{
  "simulationId": "sim_01HQ...",
  "targetRps": 10000,
  "dashboardUrl": "/ops"
}
```

**Implementation note:** uses `Promise.all` with staggered `setTimeout`s. Each synthetic request gets a unique `Idempotency-Key` (so no dedupe) and a synthetic `passengerName` (e.g. `"SimUser-<n>"`).

---

## 6. Worker Endpoints

### 6.1 `POST /api/worker/allocate` — QStash consumer

**Runtime:** Node. **Auth:** `verifySignatureAppRouter` (QStash JWT).
**Delivery:** at-least-once from QStash Flow Control (`key: train.<id>, parallelism: 1`).
**Must be idempotent** — processing same message N times == N=1.

#### Request (from QStash)

```http
POST /api/worker/allocate HTTP/1.1
Content-Type: application/json
Upstash-Signature: eyJhbG...<JWT>

{
  "bookingId": "b6a7...",
  "idempotencyKey": "3fa85f64-...",
  "trainId": "12951",
  "passengerName": "Rahul Sharma"
}
```

**Zod:**

```ts
export const AllocateJobSchema = z.object({
  bookingId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  trainId: z.string().min(1),
  passengerName: z.string().min(1).max(100),
});
```

#### Handler pipeline

```
1. verifySignatureAppRouter(req)             -> 401 invalid_qstash_signature on fail
2. Parse body, Zod validate                  -> 400 invalid_request_body on fail
3. Check bookings table: if CONFIRMED, return 200 OK (QStash will ack)
4. db.rpc('allocate_seat', {...})            -> returns seat_id or 0 rows (sold out)
5. If 0 rows: release_hold + write response (status: FAILED, sold_out) -> return 200 OK
6. paymentService.charge(amount, idempotencyKey)  (wrapped in Cockatiel policy)
   - Failure -> release_hold + 500 (QStash retries with exp backoff)
   - Max retries exhausted -> 489 with Upstash-NonRetryable-Error: true (DLQ)
7. confirm_booking(bookingId, seatId, paymentId)
   - If 0 rows (hold expired): refund payment + return 200 with status EXPIRED
8. write_idempotency_response(key, 200, body)
9. Return 200 OK with final booking state
```

#### Success response

```json
{
  "ok": true,
  "bookingId": "b6a7...",
  "seatId": "T12951-C03-14",
  "status": "CONFIRMED"
}
```

#### Retry response (transient failure)

```http
HTTP/1.1 500 Internal Server Error

{ "error": { "code": "upstream_failure", "message": "payment gateway timeout" } }
```

QStash retries per `retries: 3` with exponential backoff.

#### Non-retry response (permanent failure)

```http
HTTP/1.1 489
Upstash-NonRetryable-Error: true

{ "error": { "code": "payment_failed", "message": "payment declined after 3 retries" } }
```

QStash skips retry, sends to DLQ, fires `failureCallback` to `/api/webhooks/qstash-failure`.

---

### 6.2 `POST /api/sweeper/expire-holds` — scheduled sweeper

**Runtime:** Node. **Auth:** QStash signature.
**Schedule:** QStash Schedule every 60s.
**Idempotent by design:** advisory lock guard skips concurrent runs.

```http
POST /api/sweeper/expire-holds HTTP/1.1
Upstash-Signature: eyJhbG...
```

Handler:

```ts
const { data, error } = await supabaseAdmin.rpc('sweep_expired_holds');
// data: [{ swept_count: 7, skipped: false }]
```

Response:

```json
{ "ok": true, "swept": 7, "skipped": false }
```

or if concurrent:

```json
{ "ok": true, "swept": 0, "skipped": true }
```

---

### 6.3 `POST /api/webhooks/qstash-failure` — DLQ mirror

**Runtime:** Node. **Auth:** QStash signature.
**Triggered by:** QStash `failureCallback` on worker max-retries-exhausted.

Body (from QStash):

```json
{
  "status": 489,
  "header": { "Upstash-Message-Id": "msg_abc..." },
  "body": "<base64 original payload>",
  "retried": 3,
  "sourceMessageId": "msg_xyz..."
}
```

Handler writes a row to `dlq_jobs`:

```sql
INSERT INTO dlq_jobs (qstash_message_id, payload, error_reason, attempt_count)
VALUES ($1, $2, $3, $4);
```

Response: `200 OK { "ok": true }`.

---

## 7. Admin Endpoints

All require `Authorization: Bearer <ADMIN_SECRET>` header. Miss -> `401 admin_unauthorized`.

Rate-limited with **custom Lua sliding-window-log** (Rule 4.1 ammunition): 30/min per IP, 100% accurate.

### 7.1 `GET /api/admin/dlq` — list DLQ

```http
GET /api/admin/dlq?status=unresolved&limit=50 HTTP/1.1
Authorization: Bearer <ADMIN_SECRET>
```

Response:

```json
{
  "jobs": [
    {
      "id": "d3a...",
      "qstashMessageId": "msg_abc",
      "payload": { "bookingId": "b6a7...", "idempotencyKey": "..." },
      "errorReason": "payment_failed after 3 retries",
      "attemptCount": 3,
      "createdAt": "2026-04-18T04:30:15Z",
      "resolved": false
    }
  ],
  "total": 7
}
```

---

### 7.2 `POST /api/admin/dlq/[id]/retry` — manual retry

```http
POST /api/admin/dlq/d3a.../retry HTTP/1.1
Authorization: Bearer <ADMIN_SECRET>
Idempotency-Key: <uuid>
```

Re-publishes the original payload to QStash with `deduplicationId` = original message ID (so it doesn't double-enqueue if double-clicked). Marks `dlq_jobs.retried_at`.

Response:

```json
{ "ok": true, "newMessageId": "msg_new...", "status": "requeued" }
```

---

### 7.3 `POST /api/admin/kill-worker` — chaos demo

**Purpose:** demo-time deliberate failure injection. Causes next `/api/worker/allocate` invocation to throw before allocation.

```http
POST /api/admin/kill-worker HTTP/1.1
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{ "failNextN": 3, "failureMode": "timeout" | "500" | "crash" }
```

Handler writes a short-lived Redis flag `chaos:worker:fail-next=3` with TTL 60s. Worker checks this flag at pipeline start; if set, decrements and throws selected failure type.

Response: `200 OK { "ok": true, "willFailNextN": 3 }`.

---

### 7.4 `POST /api/admin/reset` — demo reset

**Purpose:** nuke state between demo runs.

```http
POST /api/admin/reset HTTP/1.1
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{ "confirm": "reset", "trainId": "12951" }
```

Transactionally:
1. `UPDATE seats SET status='AVAILABLE', booking_id=NULL, held_*=NULL WHERE train_id=$1`
2. `DELETE FROM bookings WHERE train_id=$1`
3. `DELETE FROM payments WHERE idempotency_key IN (...)`
4. `DELETE FROM idempotency_keys WHERE created_at > now() - interval '1 hour'`
5. `DELETE FROM dlq_jobs WHERE resolved_at IS NULL`

Response: `200 OK { "ok": true, "reset": { "seats": 500, "bookings": 347, "payments": 347, "idempotencyKeys": 357, "dlq": 4 } }`.

---

## 8. System Endpoints

### 8.1 `GET /api/healthz`

**Runtime:** Edge. **Auth:** None.

```http
GET /api/healthz HTTP/1.1
```

Checks:
- Redis PING (timeout 500ms)
- Postgres count from `trains` (timeout 1s via Cockatiel)
- QStash reachability (HEAD request to qstash.upstash.io, timeout 1s)

Response:

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "checks": {
    "redis": "ok",
    "postgres": "ok",
    "qstash": "ok"
  },
  "version": "1.0.0",
  "timestamp": "2026-04-18T04:30:15Z"
}
```

HTTP status: `200` if all ok, `200` if any degraded (returns degraded state in body), `503` if all dependencies unreachable.

---

### 8.2 `GET /api/insights/[metric]` — Grafana proxy

**Runtime:** Edge. **Auth:** None (public metric shapes).
**Purpose:** server-side proxy to Grafana Cloud Prometheus HTTP API so Recharts can render on the landing and `/ops` without exposing Grafana credentials to the browser.

```http
GET /api/insights/bookings_per_sec?range=5m&step=5s HTTP/1.1
```

**Server-side:** GET `https://<grafana_prom_url>/api/v1/query_range?query=rate(tg_allocations_total[1m])&start=...&end=...&step=5s` with `Authorization: Bearer <GRAFANA_PROM_READ_TOKEN>`.

Response (passthrough with minor shape):

```json
{
  "metric": "bookings_per_sec",
  "unit": "req/s",
  "points": [
    { "t": 1713410400, "v": 147.3 },
    { "t": 1713410405, "v": 162.8 }
  ]
}
```

Supported `metric` values: `bookings_per_sec`, `queue_depth`, `p95_latency_ms`, `error_rate`, `dlq_count`, `seats_remaining`. Each maps server-side to a specific PromQL query.

---

## 9. Central Zod Schemas Module (`lib/validation/*.ts`)

```ts
// lib/validation/common.ts
export const IdempotencyKeySchema = z.string().uuid();
export const TrainIdSchema = z.string().min(1).max(20).regex(/^[A-Z0-9]+$/);

// lib/validation/book.ts
export const BookRequestSchema = z.object({
  trainId: TrainIdSchema,
  passengerName: z.string().min(1).max(100).trim(),
  passengerPhone: z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
});
export type BookRequest = z.infer<typeof BookRequestSchema>;

// lib/validation/worker.ts
export const AllocateJobSchema = z.object({
  bookingId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  trainId: TrainIdSchema,
  passengerName: z.string().min(1).max(100),
});
export type AllocateJob = z.infer<typeof AllocateJobSchema>;

// lib/validation/simulate.ts
export const SimulateRequestSchema = z.object({
  trainId: TrainIdSchema,
  requestCount: z.number().int().positive().max(100_000),
  windowSeconds: z.number().int().positive().max(60),
});

// lib/validation/chaos.ts
export const KillWorkerSchema = z.object({
  failNextN: z.number().int().positive().max(100),
  failureMode: z.enum(['timeout', '500', 'crash']),
});

// lib/validation/reset.ts
export const ResetSchema = z.object({
  confirm: z.literal('reset'),
  trainId: TrainIdSchema,
});
```

---

## 10. Rate Limit + Backpressure Matrix

| Endpoint | Algorithm | Limit | Scope | Header on 429 |
|---|---|---|---|---|
| `POST /api/book` | sliding-window counter | 100 / 10s | per user-id (IP or fingerprint) | `RateLimit: "sliding";r=0;t=8` |
| `GET /api/book/[jobId]` | — | (polling allowed) | — | — |
| `GET /api/seats` | sliding-window counter | 60 / 60s | per IP | — |
| `POST /api/simulate` + admin **mutations** (reset, kill-worker, dlq retry) | custom Lua log | 30 / min | per admin token (WRITE bucket) | Rule 4.1 ammo |
| Admin **reads / polling** (`/api/admin/live-stats`, `/api/admin/recent-bookings`) | custom Lua log | 300 / min | per admin token (READ bucket) | — |

**Why two buckets:** a single shared admin bucket was starved by the `/ops`
page's own polling (live-stats @ 1.5 s + recent-bookings @ 2 s = 70 req/min)
before any operator mutation could land. Read/write separation keeps the
mutation limit strict (the Rule 4.1 demo-safety story) while giving reads
5× headroom over the observed poll load. See ADR-011 Consequences.

**Backpressure (503 + Retry-After):**

- `/api/book`: queue depth > 2000 (measured every 5s, cached in Redis)
- `/api/simulate`: always allowed (admin token is trust boundary)

---

## 11. Contract Testing

Tests in `tests/contract/*.test.ts` against a deployed preview URL. Each endpoint has:

1. **Happy path** — correct input -> expected shape
2. **Idempotency replay** — two calls with same key -> second has `Idempotent-Replayed: true`
3. **Zod validation** — bad input -> 400 with field errors
4. **Rate limit** — N+1 calls -> 429
5. **Error shape** — all errors match `{ error: { code, message, request_id } }`

Run: `pnpm test:contract -- --url https://trains-and-tracks.vercel.app`

---

## 12. Summary of Contract Invariants

1. **Every mutating POST requires `Idempotency-Key`.**
2. **Every response carries `X-Request-ID`.**
3. **Errors always have `error.code` from the canonical list.**
4. **Rate-limited responses always carry both IETF draft-10 and legacy headers.**
5. **`Idempotent-Replayed: true` if and only if the response body was cached from a prior call.**
6. **Worker endpoints (`/api/worker/*`, `/api/sweeper/*`) require valid `Upstash-Signature`.**
7. **Admin endpoints (`/api/admin/*`) require `Authorization: Bearer <ADMIN_SECRET>`.**
8. **Operational failures (sold_out, payment_failed, hold_expired) return HTTP 200 with `status: FAILED` in body.** Protocol failures return 4xx/5xx.
9. **No endpoint ever hangs**: every response arrives within `maxDuration = 60s` (usually <200ms).

---

**Next doc:** `FAILURE_MATRIX.md` — component × failure × mitigation × evolution.
