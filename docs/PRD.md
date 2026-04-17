# Trains and Tracks — Product Requirements Document

**Version:** 1.0 · **Status:** Draft · **Date:** 2026-04-17 · **Owner:** build team
**Build window:** Apr 17 2026 17:30 IST → Apr 18 2026 10:30 IST (17 h + 1 h Phase 2)

---

## 1. Executive Summary

Trains and Tracks is a reservation engine that guarantees **effectively-once seat allocation under traffic surges that exceed planned capacity by orders of magnitude**. Built as a simplified IRCTC-Tatkal replacement, it demonstrates that the failure modes of real-world Indian booking systems — payment-debited-but-no-ticket, duplicate seat allocations, silent request drops — are not inevitable but design choices. Every correctness guarantee comes from composable patterns (Stripe-contract idempotency keys, Postgres `FOR UPDATE SKIP LOCKED`, at-least-once delivery + idempotent consumers, admission control with bounded concurrency, QStash Flow Control sharded by train), not vendor magic.

The three defense lines judges will hear:

1. *"Exactly-once delivery is provably impossible (Two Generals / FLP). We deliver **effectively-once execution**: at-least-once transport + idempotent consumers at Redis and Postgres."*
2. *"QStash is our at-least-once transport. The orchestration — admission, idempotency, allocation, sweeper, breaker, metrics — is ~2,000 lines we wrote."*
3. *"Admission control, not capacity, was the failure mode in IRCTC / Coldplay BMS / CoWIN / Ticketmaster. We rate-limit by identity with bounded worker concurrency and fail closed with honest 429 / 503 + `Retry-After`."*

---

## 2. Problem Statement

### 2.1 The pain (sourced to research dossier §2)

| System | Event | Scale | Failure mode |
|---|---|---|---|
| **IRCTC Tatkal** (ongoing daily 10 AM AC / 11 AM sleeper) | 1.84M tickets/day, ~3 lakh concurrent peak, 800K–1M login attempts, ~330K clear, 7K tickets/min | **50% of first-5-min login traffic is bot-driven** (Ministry of Railways public statement, 2025); CAPTCHA broken at 98% by published CV models | Payment deducted before seat allocation confirmed; legitimate users lose seats to bots |
| **BookMyShow Coldplay India** (Sept 2024) | 13M queued for ~150K tickets — **305× demand**; Viagogo resale at 27× markup | Global queue key + weak bot mitigation; pre-sale logged-in users auto-logged-out at T=0 | Late joiners leapfrogged earlier queuers; Mumbai EOW complaint alleged 9 lakh of 12 lakh ahead in queue were bots |
| **CoWIN** (28 Apr 2021, 18–44 registration open) | 30K updates/sec peak; 13.7M registrations in 8h | Public `api_setu` availability endpoint with 5-min read cache, weaponized by getjab.in / Telegram bots polling every 5s | Human UI users never saw an open slot |
| **Ticketmaster Eras Tour** (Nov 2022) | 3.5B system requests = **4× previous peak**; planned 1.5M, got 14M | Verified Fan gated entry but not checkout throughput; cart holds weren't reliably held | Senate Judiciary hearing, Joe Berchtold apology under oath 24 Jan 2023 |

**Common root cause:** *admission control, not capacity, was the limiting factor.* Every system under-forecast peak by an order of magnitude.

### 2.2 Why existing OSS clones fail

Every IRCTC / BookMyShow clone on GitHub (YashPrime-02, mridulgupsss, msdeep14, fahad-011, the `bookmyshow-clone` topic) uses the same pattern: client-side countdown soft-lock → socket-based seat selection → Razorpay commit boundary. **None implement proper server-side TTL, distributed locks, or queueing with admission control.** They would collapse under a Tatkal spike identically to the systems they imitate. Trains and Tracks is the concrete fix.

### 2.3 Solution statement

Trains and Tracks decouples **intent capture** (accept or reject fast under backpressure) from **intent resolution** (allocate seats durably, dedup retries and failures):

- **Intent capture layer:** rate-limits by identity (sliding-window counter), enforces `Idempotency-Key` per Stripe contract, returns 202 Accepted in <200 ms.
- **Intent resolution layer:** QStash-driven workers with per-train serialization via `flowControl.key = train:{trainId}, parallelism: 1`, executing seat allocation via single-statement `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` — the same pattern underpinning Solid Queue (Rails), Oban (Elixir), pg-boss (Node), Que, River (Go), GoodJob in production today.

---

## 3. Target Users

### 3.1 Primary — "The Dad"
45-year-old salaried professional trying to book 4 Tatkal tickets to his parents' village for Diwali. Mid-range Android, 4G connection. Has been burned three times: payment debited, no ticket, refund in 7 days. Does not know what a "thundering herd" is — knows his parents have spent the last three Diwalis alone.

### 3.2 Secondary — "The Judge"
Systems engineer evaluating whether correctness claims survive inspection. Will ask: *"what happens when a worker dies mid-booking?"*, *"what's your p95 at 2K rps?"*, *"isn't this just QStash + Supabase?"*, *"show me your idempotency test."*

### 3.3 Tertiary — "The Operator" (us during demo)
Opens `/ops`, clicks "Simulate Tatkal Surge", narrates the Grafana panels live.

---

## 4. Scope

### 4.1 MUST have (P0 — scored)

- Single train, single route, 500 seats (New Delhi → Mumbai Central, 12951 Rajdhani proxy)
- `POST /api/book` accepts `Idempotency-Key` header; Stripe contract semantics
- Anonymous bookings (passenger name as plain field — no auth)
- QStash queue with `flowControl.key = train:{trainId}, parallelism: 1`
- Postgres seat allocation via single-statement `UPDATE ... FOR UPDATE SKIP LOCKED`
- Two-layer idempotency: Redis `SET NX EX 60` pre-flight + Postgres UNIQUE + CTE+UNION
- `@upstash/ratelimit` sliding-window on `/api/book` hot path
- **Custom Lua sliding-window-log** on `/api/admin/*` (Rule 4.1 ammunition)
- Cockatiel circuit breaker wrapping Postgres; policy = `wrap(timeout, retry, breaker)` with SamplingBreaker (50% over 10s, min 1 rps)
- Hold-and-release state machine: `AVAILABLE → RESERVED (held_until +5min) → CONFIRMED` or rollback
- QStash Schedule sweeper every 60s (not Vercel Cron — Hobby is daily-only)
- `pg_try_advisory_xact_lock(8675309)` guard on sweeper (prevents double-sweep)
- Mock `PaymentService` with injectable failure rate (`PAYMENT_FAILURE_RATE=0.3` for demo)
- DLQ: QStash automatic + `/api/admin/dlq` list + manual retry
- Metrics pipeline: `prometheus-remote-write@0.5.1` inside `waitUntil` → Grafana Cloud Mimir
- `/ops` dashboard: Grafana Shared Dashboard iframe + native Recharts "Live bookings/sec" hero
- "Simulate Surge" button: 100,000 parallel requests over ≤10 s
- Deployed on Vercel (Fluid Compute, Hobby), Supabase (Nano), Upstash (QStash + Redis Free), Grafana Cloud (Free)

### 4.2 SHOULD have (P1 — if time)

- Random queue position at T=0 (Ticketmaster Smart Queue pattern — only legitimate bot defense without Aadhaar integration)
- Multiple trains to showcase Flow Control sharding (`train:1`, `train:2` processing in parallel)
- `@vercel/otel` tracing → Grafana Tempo, 10% sampling
- `/ops/dlq` page with retry + delete controls
- `/ops/chaos` page with "Kill Worker" button for demo

### 4.3 WON'T do (explicitly cut)

- **Real payment gateway** (Razorpay / Stripe) — mock with injectable failure instead. Rationale: (a) Rule 4.1 wrapper hazard, (b) controlled demo failure impossible with real gateway, (c) 2–3 h time sink.
- **User accounts / auth** — anonymous bookings. Auth is orthogonal to the correctness problem.
- **Coach / class / berth selection** — every seat is equivalent.
- **Multi-seat atomic booking** (4 adjacent seats) — would require SERIALIZABLE + 40001 retry loop. Scope creep.
- **Multi-region replication** — single Vercel + Supabase region. Documented as evolution path in `FAILURE_MATRIX.md`.
- **Real CAPTCHA / bot detection** — rate limiting only. Aadhaar/DigiLocker integration (IRCTC's July 2025 move) infeasible in 17h.
- **Train route search** — hardcoded single route.
- **Email / SMS notifications** — on-screen confirmation only.
- **Refund processing** — no real money charged, no refund needed.

---

## 5. Non-Functional Requirements

### 5.1 Performance targets

| Metric | Target | Verified via |
|---|---|---|
| p50 latency `POST /api/book` (happy path) | <100 ms | Grafana `histogram_quantile(0.50, ...)` |
| p95 latency `POST /api/book` @ 2K rps sustained | <200 ms | Grafana `histogram_quantile(0.95, ...)` |
| p99 latency `POST /api/book` @ 2K rps sustained | <500 ms | Grafana `histogram_quantile(0.99, ...)` |
| Sustained ingress | 2,000 rps | Load test |
| Burst ingress | 100,000 requests over 10 s | Simulate Surge button |
| Allocation throughput | 200/s per train (QStash `rate: 200, period: '1s'`) | `tg_allocations_total` rate |
| End-to-end p95 (202 → CONFIRMED) | <5 s under burst | Client poll timer |

### 5.2 Correctness guarantees (the product's reason to exist)

1. **Zero duplicate seat allocations.** Verified by `SELECT seat_id, COUNT(*) FROM bookings WHERE status='CONFIRMED' GROUP BY seat_id HAVING COUNT(*) > 1` returning zero rows.
2. **Zero lost booking intents.** Verified by `ingress_count == confirmed + failed + dlq_count + rate_limited` across demo run.
3. **Idempotency safety (Stripe contract).** Same `Idempotency-Key` within 24h → identical response + header `Idempotent-Replayed: true`. Same key + different canonical-JSON body hash → HTTP 400 `idempotency_key_in_use`.
4. **Hold semantics.** A seat in `RESERVED` with `held_until > now()` cannot be allocated elsewhere.

### 5.3 Availability (for defense, not SLA claim)

- Combined free-tier effective availability: ~99.5% (Vercel ~99.99 × Supabase ~99.9 × Upstash ~99.9 × Grafana ~99.9)
- Single-region — documented as evolution path in `FAILURE_MATRIX.md`

### 5.4 Reliability

- Every external call wrapped in Cockatiel policy: `wrap(timeout(2s), retry(2 attempts, exp backoff 100ms→1s), breaker(50% / 10s, minRps 1, halfOpenAfter 30s))`
- Rate limiter **fails open** (log warning, let request through) if Redis is unreachable — availability > strict admission
- Circuit breaker on Postgres **fails closed** (503 + `Retry-After`) — correctness > availability
- Hold sweeper recovers any missed tick on next invocation (60s re-run)

### 5.5 Observability

**Metrics** (custom registry, pushed via remote_write):

- `tg_booking_requests_total{method, route, status}` — Counter
- `tg_admissions_total{reason}` / `tg_rejections_total{reason}` — Counter
- `tg_queue_depth{queue}` — Gauge (polled from QStash)
- `tg_allocations_total{train_id, outcome}` — Counter
- `tg_retries_total{stage}` / `tg_dlq_total{reason}` — Counter
- `tg_http_request_duration_seconds{route, status}` — Histogram (buckets `[0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]`)
- `tg_db_pool_utilization_ratio` — Gauge
- `tg_cache_hits_total{result}` — Counter (`hit|miss|error`)
- `tg_seats_remaining{train_id}` — Gauge
- `tg_breaker_state{dep}` — Gauge (`0=closed, 1=half, 2=open`)
- `tg_idempotency_cache_hit_total{layer}` — Counter (`redis|postgres`)

**Logs:** pino JSON to stdout (NO transports on Vercel — hits "Cannot find module 'thread-stream'"). Child logger per request with `request_id`, `idempotency_key`, `job_id`.

**Traces:** `@vercel/otel` at 10% sampling (if time allows). Span per stage: admit → publish → consume → allocate → respond.

---

## 6. Core User Flows

### 6.1 Happy path

1. User opens `/book` at 09:59:58. Seat grid rendered. Clicks seat 7B.
2. Modal: "BOOK SEAT 7B — ₹1,260". Confirm.
3. Client generates UUIDv4 `Idempotency-Key`. `POST /api/book` with `{trainId, seatId, passengerName, idempotencyKey}`.
4. Server pipeline (all <200 ms):
   - Zod validates body
   - Rate limit check (`@upstash/ratelimit` sliding window 100/10s per IP)
   - Redis `SET NX EX 60` on `idem:${userId}:${key}` — if fail, check Postgres for existing response and return replay
   - Postgres CTE+UNION insert into `idempotency_keys` with request_hash
   - `qstash.publishJSON({ url, body, flowControl: { key: 'train:12951', parallelism: 1 }, retries: 3 })`
   - Response **202 Accepted** `{ jobId, pollUrl }` with headers `Idempotent-Replayed: false`, `RateLimit-Policy`, `RateLimit`
5. Client polls `GET /api/book/:jobId` every 1s (or SSE)
6. QStash delivers to `/api/worker/allocate-seat`:
   - `verifySignatureAppRouter` verifies JWT against raw body
   - Single-statement `UPDATE seats SET status='RESERVED' ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING id`
   - `paymentService.charge(1260, idempotencyKey)` — mock succeeds
   - Update booking to `CONFIRMED`, write `response_body` to `idempotency_keys`
7. Client poll returns `CONFIRMED` — render ticket
8. Total wall-clock: 1.5–4 seconds

### 6.2 Surge path (demo)

1. Operator clicks "Simulate Tatkal Surge" on `/ops`
2. `POST /api/simulate` spawns 100,000 parallel fetches to `/api/book` over ≤10s (server-side; runs inside Vercel)
3. First ~2K/s pass rate limiter; rest → 429 + `Retry-After`
4. Queue depth climbs to 8K+. Admission switches to 503 + `Retry-After` for new arrivals beyond 2K queue depth
5. Workers allocate at ~200/s per train (Flow Control rate). After ~500 allocations → "sold out" responses
6. Operator narrates Grafana panels: ingress, queue depth, processing rate, success, 429, DLQ
7. Final state (after ~60s): 500 CONFIRMED · ~99,500 rejected with explicit reasons · 0 duplicates · 0 DLQ

### 6.3 Chaos path (worker killed mid-surge)

1. Operator clicks "Kill Worker" admin button (or triggers Vercel redeploy)
2. In-flight jobs fail → QStash retries with exponential backoff (2 attempts default)
3. Retried consumer sees Redis NX already held → fast skip (or Postgres UNIQUE conflict → return existing response)
4. No duplicate allocation. No lost booking. Counts match exactly.
5. `tg_retries_total` ticks up visibly in dashboard; success count correct

### 6.4 Payment failure path

1. Worker allocates seat to `RESERVED (held_until = now() + 5min)`
2. Mock payment fails (30% injected failure rate during demo)
3. Worker catches `PaymentError`, rolls seat to `AVAILABLE`, returns error body
4. QStash retries (exponential backoff, `Upstash-Retries: 3`)
5. On retry success: seat re-allocated (possibly different seat), payment charged ONCE via idempotency key
6. On all retries exhausted: HTTP 489 + `Upstash-NonRetryable-Error: true` → QStash DLQ; sweeper releases any held seats after TTL

### 6.5 Expired-hold path (sweeper)

1. Seat reserved at 10:00:05, `held_until = 10:05:05`
2. Payment never completes (client abandoned / network died)
3. At 10:06:00 QStash Schedule invokes sweeper endpoint (next minute boundary after hold expiry; worst-case ≤60s latency)
4. Sweeper `pg_try_advisory_xact_lock(8675309)` → if acquires, `UPDATE seats SET status='AVAILABLE' WHERE status='RESERVED' AND held_until < now()`
5. Seat returns to pool for re-allocation

---

## 7. Constraints

### 7.1 Hackathon
- Build window: ~17 h + 1 h Phase 2 polish
- Solo effective build
- Must be live-demonstrable, not screenshotted (Rule 4.1)
- Must be explainable under interrogation (Rule 7 "Inability to explain system or code" → disqualification)
- No pre-built / plagiarised code (Rule 4.1)
- API-only wrappers penalized → ~2,000 LOC orchestration vs ~30 LOC vendor glue
- Free tier only (Rule 5.2 — paid APIs without disclosure prohibited)

### 7.2 Technical (from dossier)
- **Vercel Hobby:** 300s fn timeout max (Fluid), 4 CPU-hours/mo budget → pin `maxDuration = 60` on DB routes
- **Supabase Nano:** 60 `max_connections`, ~10–15 pre-consumed by internal services → ~45 usable direct → **must use Supavisor transaction pooler port 6543 with `?pgbouncer=true&connection_limit=1`**; session advisory locks leak on TX pooler → use `pg_advisory_xact_lock` only
- **Upstash QStash Free:** 1,000 msg/day soft limit (no errors on overage, then pay-as-you-go $1 / 100K) → budget ~$1–2 for simulate-surge
- **Upstash Redis Free:** 10K commands/day → budget with Lua (1 op per check)
- **Grafana Cloud Free:** 10K metric series, 50GB logs, 50GB traces, 14-day retention, 3 users. **No authenticated iframe embedding** → Shared Dashboard (public) only.
- **prom-client broken on serverless scrape** → `prometheus-remote-write@0.5.1` inside `waitUntil`
- **`ON CONFLICT DO NOTHING RETURNING` silently returns 0 rows** → always use CTE + UNION pattern
- **QStash signature verification requires raw body** → don't parse+restringify before verify
- **Nov 2025 active bug:** Vercel Fluid + Supavisor TX + `attachDatabasePool` leaks pool clients → monitor `pg_stat_activity.numbackends`; fall back to direct if balloons

---

## 8. Success Criteria

Trains and Tracks is successful for the hackathon if **all ten** are green at submission:

1. ✅ System deployed live at public Vercel URL
2. ✅ Landing page loads with hero video + problem narrative + CTAs
3. ✅ Booking end-to-end works: select → submit → confirm in <5s
4. ✅ `/ops` dashboard shows live metrics (Grafana iframe + native Recharts hero)
5. ✅ Simulate Surge button fires 100K requests over ≤10s
6. ✅ Post-surge correctness: exactly 500 CONFIRMED · 0 duplicates · ingress = confirmed + failed + dlq + rate_limited
7. ✅ Chaos test passes: worker kill → retries visible → final count still 500 · 0 duplicates
8. ✅ Idempotency test: 10 replays of same request → identical response with `Idempotent-Replayed: true` after first
9. ✅ `CONCEPTS.md`, `DECISIONS.md`, `FAILURE_MATRIX.md` all filled and accessible from README
10. ✅ Presentation deck ready (problem · case studies · architecture · demo · scaling story)

---

## 9. Judging-Criterion Alignment

| Criterion | Weight | How we score it |
|---|---|---|
| **Problem–Solution Fit** | 25% | PS #8 stated as "handle load spikes without dropping/duplicating." We address 1:1. Tatkal narrative concretizes the problem for Indian judges. Ground-reality passes (every judge has failed Tatkal). |
| **Architecture & Design Decisions** | 25% | Clean layering: admission / transport / resolution / storage / observability. Five architectural forks locked with rationale in `DECISIONS.md`. Rule 4.1 framing explicit in README: *transport is QStash, orchestration is ours.* |
| **Implementation Depth** | 30% | Real logic: CTE+UNION idempotency with request-hash verification, custom Lua sliding-window-log, single-statement SKIP LOCKED allocation, hold/release state machine with advisory-lock-protected sweeper, composed Cockatiel policy (timeout + retry + breaker), remote-write metrics pipeline with request-scoped waitUntil. |
| **Runtime Behavior** | 20% | Demo IS the runtime test. Surge + worker-kill + idempotency-replay all exhibit stable behavior with live metrics proving authenticity. |

---

## 10. 60-Second Demo Script

> *[Landing page — hero video: crowded Indian railway platform at 10:00 AM playing]*
>
> My father missed three Diwali trips to his parents' village because IRCTC kept failing him at Tatkal. Every year, same story — payment deducted, no ticket, refund in seven days. For seven lakh people every single morning, this isn't a bug. It's the system.
>
> We built what the system should have been.
>
> *[Click "Open Ops Dashboard" — Grafana panels visible, live metrics updating]*
>
> This is Trains and Tracks. Live, right now. 500 seats on one train. Watch.
>
> *[Click red button "SIMULATE 10 AM TATKAL SURGE — 100,000 requests"]*
>
> *[Panels light up — ingress spikes to ~10K rps, queue depth climbs to 8K, admissions tick to 500, rejections to 99,500+]*
>
> Five hundred seats in, five hundred tickets out. Zero duplicate bookings. Zero lost payments. Ninety-nine-point-five thousand users got an honest 'queue full, try again' in a hundred milliseconds. Nobody hangs. Nobody gets charged for a seat they didn't get.
>
> *[Click "Kill Worker" admin button]*
>
> I just killed a worker mid-surge. Watch the retry counter.
>
> *[`tg_retries_total` ticks up; success count continues cleanly to 500]*
>
> QStash retries. Idempotency keys block duplicates. The booking either commits or doesn't — never both.
>
> *That's the system IRCTC should have built.*
>
> Four minutes in our repo shows ~30 lines of QStash glue and 2,000 lines of orchestration we built. Full breakdown in `DECISIONS.md`. Thank you.

---

## 11. Assumptions

- All four free tiers (Vercel, Supabase, Upstash, Grafana Cloud) remain accessible and within quota during the build + demo window
- Venue network stable enough for live demo
- Hero video asset sources within 60 min of queue
- Laptop Node / pnpm / git tooling stable

## 12. Open Questions / Known Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vercel Fluid + Supavisor TX pool leak (Nov 2025) | Med | High | Monitor `pg_stat_activity`; fall back to direct DB URL if `numbackends` balloons |
| QStash free tier exceeded during simulate surge | High | Low | Acknowledge $1–2 overage cost; explicit in judge Q&A |
| Grafana Shared Dashboard slow to load on venue wifi | Med | Med | Have static screenshot fallback in slide deck |
| Hero video gen takes >60 min | Med | Med | Fallback to Pexels stock `indian railway station crowded` |
| Demo laptop dies / charger issue | Low | High | Dual-laptop; record demo video as backup submission |

---

## 13. Document Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-17 21:30 IST | Initial PRD synthesized from research dossier |
