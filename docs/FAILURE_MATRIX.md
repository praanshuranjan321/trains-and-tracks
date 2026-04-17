# Trains and Tracks — Failure Matrix

**Version:** 1.0 · **Status:** Draft · **Date:** 2026-04-17

---

## 1. Failure Philosophy

Every Trains and Tracks component can fail. The architecture accepts this and chooses a deliberate posture for each failure class:

### Core postures

| Class | Posture | Example |
|---|---|---|
| **Availability vs strict admission** | Fail OPEN | Rate limiter down -> allow request through, log warning |
| **Availability vs correctness** | Fail CLOSED | Postgres breaker open -> return 503, don't allocate |
| **Transient failures** | Retry with backoff + jitter | QStash publish timeout, payment timeout |
| **Permanent failures** | DLQ + operator visibility | Payment declined 3x -> DLQ + alert |
| **Concurrency races** | Optimistic + version check | Sweeper vs confirm race — whoever loses aborts |
| **Client-side failures** | Idempotent replay | Network flap -> retry with same key, get original answer |
| **Intentional chaos** | Observable via metrics | Kill-worker button demonstrates recovery live |

### Three correctness invariants preserved through every failure

Every mitigation in this document preserves at least one of these:

1. **No duplicate allocation** — seat ID cannot appear in two CONFIRMED bookings
2. **No lost intent** — accepted request (2xx) -> CONFIRMED | FAILED | EXPIRED | in DLQ
3. **No silent hang** — every request gets a response within `maxDuration=60s` (usually <200ms)

If a proposed mitigation violates any of these, we reject it.

---

## 2. Master Failure Matrix

Every known failure, grouped by class. Read across: what breaks -> how we notice -> what we do now -> what evolves at scale.

### 2.1 Infrastructure failures

| Failure | Detection | Mitigation (now) | Evolution at scale |
|---|---|---|---|
| **Vercel region outage** | Health check 5xx from probe; user reports | Single-region hackathon; accept ~99.9% SLA | Multi-region functions + Route 53 active/passive |
| **Vercel function cold start >2s** | `tg_http_request_duration_seconds` p99 spike; OTel span | Fluid Compute keeps instance warm for concurrent invocations (dossier §11: "zero cold starts 99.37%") | Pro tier Fluid + provisioned concurrency |
| **Vercel function OOM/crash** | Instance terminates; QStash sees non-2xx; retries | QStash retry + idempotent consumer recovers; no data loss | Pro tier has larger memory limits |
| **Supabase database down** | Cockatiel breaker trips; `tg_breaker_state{dep="postgres"}=2` | 503 + `Retry-After: 30` to clients; circuit reopens on success probe | Multi-AZ Supabase Pro + read replica for polling |
| **Supavisor pooler down** | Connection errors in logs; breaker trips | Fall back to direct DB URL via env flag flip | Self-managed PgBouncer with failover |
| **Upstash Redis unreachable** | Redis PING timeout; breaker trips | Rate limiter **fails open** (log warning); idempotency falls to Postgres-only | Multi-region Upstash Global Redis |
| **Upstash QStash broker down / quota exhausted** | Publish throws; caught by try/catch | Mark booking `status=FAILED, failure_reason='upstream_publish_failure'` + commit 502 body into `idempotency_keys` + return 502 to client. Three invariants preserved (no duplicate / no lost / no silent hang) — client sees explicit failure, can retry with a fresh key. | Transactional outbox pattern + worker drainer (write booking + outbox row in one txn, async drainer publishes to QStash) |
| **Grafana Cloud ingest quota exhausted** | `prometheus-remote-write` returns 429 | Logged, ignored (metrics degrade; app still works) | Upgrade to Pro or downsample labels |

### 2.2 Resource exhaustion

| Failure | Detection | Mitigation (now) | Evolution at scale |
|---|---|---|---|
| **Postgres connection pool exhausted** | `FATAL: sorry, too many clients already`; `pg_stat_activity.numbackends` near max | `connection_limit=1` per Vercel invocation; 200 Supavisor pool slots absorb bursts | Larger Supabase tier + connection pooling at app layer |
| **Vercel Fluid + Supavisor pool leak (Nov 2025)** | `numbackends` climbs monotonically during burst test | Env flag to disable `attachDatabasePool`; fall back to per-request connection | Track [supabase#40671](https://github.com/orgs/supabase/discussions/40671) resolution |
| **Redis ops/day quota exhausted** | Upstash 429 responses; `tg_cache_hits_total{result="error"}` spike | Custom Lua limiter = 1 op per check (efficient); rate limit fails open under quota | Upstash pay-as-you-go |
| **Rate limit tripped (legitimate user)** | `tg_rejections_total{reason="rate_limit"}` ticks up | 429 + `RateLimit: r=0;t=8` headers; client backs off | Token bucket with burst capacity for verified users |
| **Queue depth > high-water (2000)** | `tg_queue_depth` > 2000 | `/api/book` returns 503 + `X-Queue-Depth: N` + `Retry-After` | Horizontal worker scaling + queue sharding |
| **Worker concurrency pile-up** | `allocate_seat` p95 > 500ms | Flow Control `parallelism: 1` per train limits concurrent work | Parallelism scaling with partitioned seat ranges |
| **QStash free tier exceeded** | Upstash billing notification | Accept $1–2 overage for demo day (explicit in PRD §7.2) | Pro tier (`$1 / 100K`) |

### 2.3 Data / correctness failures

| Failure | Detection | Mitigation (now) | Evolution at scale |
|---|---|---|---|
| **Double-booking race (two workers same seat)** | Zero — SKIP LOCKED prevents it | `FOR UPDATE SKIP LOCKED` in subquery -> workers get distinct rows | Same primitive holds at any scale |
| **Hold expiration race (sweeper vs worker confirm)** | Sweeper releases while worker charges -> `confirm_booking` returns 0 rows | Worker calls `refund(payment_id)` on mock (would be real refund in prod); booking -> EXPIRED | Add 2-phase commit via saga pattern if multi-service |
| **Stale `version` on optimistic update** | Version check fails -> 0 rows returned | Worker retries or returns FAILED with explicit reason | Optimistic retry loop with exponential backoff |
| **`ON CONFLICT DO NOTHING RETURNING` returns 0 rows on replay (dossier §3 footgun)** | Would cause idempotency failure | CTE+UNION pattern in `idempotency_check` function always returns 1 row | Pattern travels unchanged |
| **Request hash mismatch (same key, different body)** | `idempotency_check` returns 'existing' with mismatching hash | HTTP 400 `idempotency_key_in_use` — refuse the replay | Same |
| **Redis evicts idempotency key before Postgres writes** | Fast-fence misses; Postgres catches | Postgres UNIQUE constraint is authoritative -> still rejects duplicate | Separate idempotency-only Upstash instance (no eviction) |
| **Idempotency key expires (>24h)** | Lookup returns no row | Treated as new request — client shouldn't retry beyond TTL | Stripe-v2 style 30-day TTL |
| **Concurrent sweeper runs** | Log says `skipped: true` from second invocation | `pg_try_advisory_xact_lock(8675309)` guard | Same pattern; add leader election if multi-region |
| **Payment gateway idempotency collision** | `payments.idempotency_key UNIQUE` constraint | Same key returns existing `payment_id`; zero double-charge | Real gateway (Stripe/Razorpay) has same contract |

### 2.4 Transport failures (QStash)

| Failure | Detection | Mitigation (now) | Evolution at scale |
|---|---|---|---|
| **Worker returns 5xx** | QStash retry counter increments; `tg_retries_total{stage="allocation"}` rises | Exponential backoff retry per `Upstash-Retries: 3`; idempotent consumer re-processes safely | Unchanged |
| **Worker returns 489 + `Upstash-NonRetryable-Error`** | QStash marks failed, skips retry | Message -> DLQ; `failureCallback` fires `/api/webhooks/qstash-failure` -> `dlq_jobs` row | Ops-initiated retry or data-fix migration |
| **Invalid QStash signature** | `verifySignatureAppRouter` throws | 401 `invalid_qstash_signature`; request dropped (attack suspected) | Rotate keys via `QSTASH_CURRENT_SIGNING_KEY`/`NEXT_SIGNING_KEY` |
| **QStash delivers duplicate message** | Accepted as normal — consumer is idempotent | Redis NX + Postgres UNIQUE = same message processed once | Same |
| **QStash delivery delayed (broker slow)** | `tg_queue_depth` elevated; poll response still PENDING | Client polls; SSE would surface wait | Upstash Pro has higher delivery priority |
| **Flow Control key hashed incorrectly** | Parallelism violated; two workers for same train | Not expected — QStash tests this; monitor `tg_allocations_total{train_id}` rate vs expected | Unit tests for flow control key derivation |

### 2.5 Client-side failures

| Failure | Detection | Mitigation (now) | Evolution at scale |
|---|---|---|---|
| **Client network flap mid-POST** | Client retries with same key | Idempotency replay returns original response | Unchanged |
| **Client closes tab before receiving response** | Server processes job; nobody polls | Booking confirms or fails per normal; user can re-open and poll | SMS/email confirmation |
| **Client polls after 24h** | Idempotency key expired; poll returns `job_not_found` | 404 with explicit code | Longer retention for confirmed bookings via separate query |
| **Client smashes Book button 10x** | 10 requests with same Idempotency-Key | Redis NX on first; 9 get replay | Unchanged |
| **Client sends malformed body** | Zod validation fails | 400 `invalid_request_body` with field-level details | Same |
| **Client abandons payment flow** | Hold sits at RESERVED until `held_until` | Sweeper releases after 5 min; booking -> EXPIRED | Same |

### 2.6 Observability failures

| Failure | Detection | Mitigation (now) | Evolution at scale |
|---|---|---|---|
| **Metrics push fails (`prometheus-remote-write` 4xx/5xx)** | Caught in `waitUntil`; logged | Swallowed — metrics degrade, app continues; `logger.warn({push_failed: true})` | Redis-backed counter buffer + cron flusher |
| **Log transport fails** | Console shows error | pino writes to stdout JSON; Vercel ingests; failure rare | Loki `remote_write` health check |
| **Grafana Dashboard loads slowly on venue wifi** | Demo starts, iframe spins | Fallback: native Recharts hero with server-side Prometheus proxy; static screenshot in slide deck | CDN for dashboard assets |
| **OTel trace export fails** | `@vercel/otel` internal error logged | Sampling drops the trace; app unaffected | Same |

### 2.7 Intentional / chaos failures (demo)

| Failure | Detection | Mitigation (now) | Evolution |
|---|---|---|---|
| **`/api/admin/kill-worker` fires** | `tg_chaos_triggered_total` increments | Worker reads Redis flag, throws timeout/500/crash per `failureMode`; QStash retries; idempotency absorbs duplicates | Same demo mechanism |
| **Mock `PaymentService` fails 30% (configurable)** | `tg_payments_total{status="failed"}` | Worker releases hold on failure, returns 5xx to QStash; retry typically succeeds on next attempt | Replace with real gateway — same retry semantics |
| **Simulate-surge button fires** | `tg_sim_requests_total` increments | Server-side parallel calls to `/api/book`; normal admission + processing flow | Same; scale via larger Vercel tier |

---

## 3. Critical-Path Failure Deep Dives

The five failure modes most likely to come up in judge Q&A. Full flow for each.

### 3.1 Worker dies mid-allocation

**Setup:** Worker has acquired seat 47B (status=RESERVED, transaction open), is about to call `paymentService.charge()`. Vercel kills the instance (`maxDuration` exceeded, OOM, redeploy).

**Sequence:**

1. Vercel terminates instance -> Postgres transaction aborts -> seat 47B `status='AVAILABLE'` again (no durable lock).
2. QStash doesn't receive 2xx/489 -> marks message as failed -> retry scheduled with exponential backoff (delay approx. 2s, 4s, 8s).
3. Retry arrives at a fresh instance. Pipeline runs:
   - Checks `bookings.status` -> still PENDING (original run never wrote confirmation)
   - Calls `idempotency_check` -> returns 'existing' with `response_body: null` (not yet written)
   - Proceeds with `allocate_seat` -> gets seat 47C (47B or 47C — SKIP LOCKED picks a free one)
   - `paymentService.charge(amount, idempotencyKey)` — same key as attempt 1
   - Payment service checks `payments.idempotency_key UNIQUE` — nothing there, creates new charge
   - `confirm_booking` -> 1 row -> CONFIRMED
4. Final state: 1 booking, 1 seat allocated, 1 payment charged. **Zero duplicates.**

**What if attempt 1 actually charged the card before dying?**
- Payment service's UNIQUE constraint returns the existing payment row.
- Worker sees "already charged" -> uses that `payment_id` -> confirms booking.
- Still 1 charge. Correctness preserved.

**Metrics surfacing this:** `tg_retries_total{stage="allocation"}+1`, `tg_allocation_duration_seconds` bimodal (fast + slow).

---

### 3.2 Sweeper and worker race on same booking

**Setup:** Worker has seat in RESERVED state, `held_until = T+5min`. At T+4:59, worker is charging payment. At T+5:00, sweeper fires.

**Sequence:**

1. Sweeper acquires `pg_try_advisory_xact_lock(8675309)`.
2. Sweeper `UPDATE seats SET status='AVAILABLE' WHERE held_until < now()` -> releases seat.
3. Sweeper updates booking to EXPIRED.
4. Worker payment succeeds (a moment later).
5. Worker calls `confirm_booking(booking_id, seat_id, payment_id)`:
   ```sql
   UPDATE seats SET status='CONFIRMED' WHERE id=$1 AND booking_id=$2
     AND status='RESERVED' AND held_until > now();
   ```
   Zero rows match (seat already AVAILABLE; booking already EXPIRED).
6. `IF NOT FOUND THEN RETURN;` — function exits early.
7. Worker calls `paymentService.refund(payment_id)` — mock returns success.
8. Worker writes `response_body` with `status: EXPIRED, failure_reason: hold_expired_during_payment`.

**Final state:** booking EXPIRED, payment refunded, seat AVAILABLE. **No double-booking.**

**How the hold-duration is chosen:** 5 minutes is generous for real payments. In a hackathon demo, shortened to 10 seconds for the hold-expiration demo case.

**Metrics:** `tg_bookings_total{status="EXPIRED"}+1`, `tg_refunds_total+1`.

---

### 3.3 Postgres connection pool exhausts during surge

**Setup:** Simulate-surge fires 100K requests in 10s. Each Vercel invocation takes 1 Supavisor pool slot.

**Sequence:**

1. First ~2000 requests acquire pool slots, process normally.
2. 2001st request: Supavisor queues the client (default behavior), wait time grows.
3. By ~2500 concurrent: Cockatiel timeout (2s) on Postgres call fires.
4. Breaker samples failure rate -> 50% within 10s -> trips OPEN.
5. All subsequent Postgres calls short-circuit -> return 503 `circuit_open`.
6. Client receives 503 + `Retry-After: 30` -> exponentially backs off.
7. After `halfOpenAfter: 30s`, breaker allows one trial call -> succeeds (load has receded) -> closes.

**Final state:** No hang, no silent drops. All 100K requests either succeeded or got honest 503 with `Retry-After`.

**Monitoring DURING surge:**

```sql
SELECT sum(numbackends), current_setting('max_connections')::int
  FROM pg_stat_database;
-- Target: numbackends < 200 (Supavisor pool size)
-- If climbs beyond: suspect Nov 2025 Fluid+Supavisor leak bug
```

**Demo talking point:** "The system refused to accept what it couldn't serve. That's the whole point."

---

### 3.4 Redis goes down mid-surge

**Setup:** Upstash Redis becomes unreachable mid-demo.

**Sequence:**

1. Rate limiter's Redis call times out -> caught by try/catch -> `logger.warn({rate_limit_failed_open: true})`.
2. Rate limiter **fails open** — allows request through (availability > strict admission).
3. Redis NX idempotency pre-flight also fails -> Postgres-only idempotency kicks in.
4. Postgres UNIQUE constraint catches all duplicates -> correctness preserved, latency slightly higher.
5. Recharts hero shows flat line (metric push fails — but landing page still works).
6. Grafana iframe continues showing historical data until refresh.

**What breaks:** rate limit accuracy during Redis outage. **What does NOT break:** correctness.

**Recovery:** Redis comes back -> rate limiter resumes -> idempotency NX fence resumes.

**Metric:** `tg_cache_hits_total{result="error"}` spike visible in dashboard.

**Defense for judges:** *"We chose availability over strict admission for rate limiting — a Redis outage is no reason to reject users. But we chose correctness over availability for Postgres — because allocating a seat we can't durably record is worse than a clean 503."*

---

### 3.5 Payment gateway timeout (real scenario via mock)

**Setup:** Mock payment service has `PAYMENT_FAILURE_RATE=0.3` and `PAYMENT_LATENCY_MS=[100, 800]`. Worker calls `charge()`.

**Sequence (failure case):**

1. `charge()` sleeps 500ms then throws `PaymentError('gateway_timeout')`.
2. Worker catches `PaymentError`, calls `release_hold(bookingId, 'payment_timeout')` -> seat -> AVAILABLE.
3. Worker returns HTTP 500 (retryable).
4. QStash exp backoff -> retry in 2s.
5. Attempt 2: fresh instance, calls `allocate_seat` (gets seat 47D, since 47B/C might be taken).
6. `paymentService.charge(amount, **same idempotencyKey**)`.
7. Mock checks `payments.idempotency_key UNIQUE` — might or might not exist:
   - If attempt 1's "timeout" actually completed the charge server-side: row exists -> returns success, `payment_id` reused.
   - If attempt 1 truly failed before recording: no row -> creates new success.
8. `confirm_booking` -> CONFIRMED. Done.

**Max retries exhausted path:**

- After 3 failures, worker returns HTTP **489** + `Upstash-NonRetryable-Error: true`.
- QStash marks permanently failed, sends to DLQ.
- `failureCallback` -> `/api/webhooks/qstash-failure` -> `dlq_jobs` row inserted.
- Sweeper eventually releases hold (booking EXPIRED).
- User sees `status: FAILED, failureReason: payment_failed` when polling.
- Operator sees entry in `/ops/dlq`, can manual-retry if appropriate.

---

## 4. Chaos Testing Catalog

Scripted tests that exercise failure paths. Run before demo.

| Test | Trigger | Expected observable | Invariant checked |
|---|---|---|---|
| **Kill-worker** | `POST /api/admin/kill-worker {failNextN:3}` | `tg_retries_total +3`; final success count correct | No duplicate / no lost |
| **Pool exhaustion** | `ab -c 300 -n 10000 /api/book` | Breaker opens at ~50% fail; 503s to clients | No silent hang |
| **Idempotency replay** | Script: 10 curls with same Idempotency-Key | 9 return `Idempotent-Replayed: true` | Single allocation |
| **Hash mismatch** | Two curls, same key, different passengerName | Second -> 400 `idempotency_key_in_use` | Stripe contract |
| **Redis kill** | Mock Redis URL to invalid host | Rate limiter fails open; system continues; warn logged | Availability preserved |
| **Hold expiration** | Set `HOLD_DURATION_SEC=10`, abandon payment | Sweeper releases in <=40s; booking -> EXPIRED | No stuck holds |
| **Concurrent sweeper** | Fire 2 sweeper HTTP calls within 1s | Second logs `skipped: true` | Single sweeper execution |
| **Payment retry success** | `PAYMENT_FAILURE_RATE=0.5`, run simulate | Eventually all bookings succeed via retries | No lost on flaky gateway |
| **Payment permanent fail** | `PAYMENT_FAILURE_RATE=1.0`, run 10 requests | All 10 -> DLQ within ~90s | DLQ visible in `/ops/dlq` |
| **Sold out** | Fill 500 seats, request 501st | Response: `status: FAILED, failureReason: sold_out` | Honest rejection, not hang |
| **Surge correctness** | `POST /api/simulate {requestCount: 10000}` | 500 CONFIRMED, rest rejected; 0 duplicates | Zero-duplicate invariant |

Automate each as a test in `tests/chaos/*.test.ts`; run against deployed URL before demo.

---

## 5. Component-Specific Failure Summaries

### Ingress (`/api/book`)
- **Fails open** on rate limiter error
- **Fails closed** on Postgres circuit open -> 503
- Backpressure at queue depth 2000 -> 503
- Every response returns within `maxDuration=60s`

### Worker (`/api/worker/allocate`)
- Idempotent per incoming message
- Retries via QStash; DLQ after max attempts
- Holds seat for 5 min; releases on payment failure
- Confirms only if hold still valid (race-safe)

### Sweeper (`/api/sweeper/expire-holds`)
- Advisory-lock guarded -> concurrent invocations skip
- Updates booking -> EXPIRED alongside seat -> AVAILABLE
- QStash Schedule re-triggers on miss (60s interval)

### Idempotency engine
- Two-layer: Redis 60s fence + Postgres 24h authority
- Fails safely: Redis down -> Postgres catches duplicates
- Hash mismatch -> HTTP 400 (Stripe contract)

### Circuit breaker (Postgres)
- 50% failure over 10s window with min 1 rps -> trips
- 30s cooldown, 3 half-open trials
- Fails CLOSED: clients see 503 instead of incorrect allocation

### Payment (mock)
- Same idempotency key as booking
- UNIQUE constraint prevents double-charge
- Retry-safe; refund on expired-hold confirmation race

---

## 6. Metrics That Surface Every Failure

Each row in this doc's master matrix maps to a specific metric. Dashboard panel -> failure surfaced:

| Panel | Metric | Failure it reveals |
|---|---|---|
| Ingress rate | `rate(tg_booking_requests_total[1m])` | Client traffic surge |
| Admission decisions | `sum by (reason)(rate(tg_admissions_total[1m])) / rate(...)` | Rate limit, backpressure, queue full |
| Queue depth | `tg_queue_depth` | Worker slowdown, Flow Control saturation |
| Allocation rate | `rate(tg_allocations_total[1m])` | Worker health |
| Retry rate | `rate(tg_retries_total[1m])` | Transient failure storm |
| DLQ count | `tg_dlq_total` | Permanent failure accumulation |
| p95 latency | `histogram_quantile(0.95, ...)` | Breaker about to trip, pool pressure |
| Error rate | `sum by (code)(rate(tg_errors_total[1m]))` | Specific failure class spikes |
| Breaker state | `tg_breaker_state{dep="postgres"}` | Circuit open = dependency issue |
| Seats remaining | `tg_seats_remaining{train_id}` | Inventory burn-down |
| Idempotency hits | `rate(tg_idempotency_cache_hit_total[1m])` | Client retry behavior |
| Pool utilization | `tg_db_pool_utilization_ratio` | Connection pressure |

**Every failure in this document is detectable from this dashboard in under 30 seconds.**

---

## 7. Scale Evolution Summary

For judge Q&A: *"how would your failure handling change at 1M concurrent?"*

| Failure class | Now | Stage 2 (100K) | Stage 3 (1M) | Stage 4 (IRCTC scale) |
|---|---|---|---|---|
| Region outage | Single-region | Multi-region DNS failover | Multi-region active-passive | Multi-region active-active with consensus |
| Pool exhaustion | Supavisor TX + connection_limit=1 | Larger Supabase tier | Partitioned per-train DBs | Per-region sharded Postgres + read replicas |
| Redis outage | Fail open (rate limit) | Multi-region Upstash | Upstash Global Redis + eventual consistency trade-off | Redis per region + idempotency in local DB |
| QStash outage | Client 503; no outbox | Transactional outbox + drainer | Multi-broker failover | Kafka with idempotent producer |
| Payment retry storm | 3 retries -> DLQ | Saga pattern with compensations | Per-provider routing | Multi-provider fallback with cost-based routing |
| Bot flood | Rate limit by IP | Token + IP scoring | Verified Fan SMS codes | Aadhaar/DigiLocker OTP binding |
| Queue fairness | FIFO + Flow Control | Weighted fair queuing | Per-identity queue slots | Ticketmaster Smart Queue random T=0 position |

---

## 8. Summary

- Every failure class has a documented mitigation and evolution path.
- Three correctness invariants (no duplicate / no lost / no silent hang) are preserved through every failure.
- Every failure is detectable via the metric catalog within 30 seconds.
- The chaos test catalog (§4) exercises the 11 most common failures before demo.
- Judge-facing defense: "We built for failure, not away from it. Every component has a known failure mode and a specific mitigation that preserves at least one correctness invariant."

---

**Next doc:** `CONCEPTS.md` — 10 patterns + analogies + model answers tailored to our code.
