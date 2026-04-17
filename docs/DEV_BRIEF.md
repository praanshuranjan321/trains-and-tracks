# Trains and Tracks — Dev Chat Brief

**Version:** 1.0 · **For:** dev Claude Code chat (separate folder)
**Handoff from:** planning chat at `/Users/praanshu/hackathon chat/`

---

## 1. Your role

You are the **development agent** for Trains and Tracks — a hackathon-grade reservation engine that guarantees effectively-once seat allocation under surge traffic. You have **~17 hours** to build, polish, and deploy a live system that passes 10 acceptance criteria.

You are NOT doing planning, research, or architecture from scratch. All of that is frozen in `/docs/`. Your job is **execution against the spec**.

## 2. Your mission — single sentence

Build a Next.js 14 app deployed to Vercel that implements the system described in `/docs/ARCHITECTURE.md` against the API contract in `/docs/API_CONTRACT.md`, passing every success criterion in `/docs/PRD.md §8`.

## 3. Mandatory reading (in this exact order, 30 min)

Before writing code, read these 8 docs end-to-end. They are the source of truth:

1. **`/docs/PRD.md`** — what we're building, scope (MUST/SHOULD/WON'T), success criteria, demo script
2. **`/docs/ARCHITECTURE.md`** — system diagram, component catalog, tech stack versions, folder structure
3. **`/docs/DATA_MODEL.md`** — tables, indexes, stored functions (SQL you'll run verbatim), seed data
4. **`/docs/API_CONTRACT.md`** — every endpoint with Zod schemas, request/response shapes, error codes
5. **`/docs/FAILURE_MATRIX.md`** — failure modes + mitigations (know before you hit them)
6. **`/docs/CONCEPTS.md`** — the 10 patterns in the code (so you name them correctly in commits/comments)
7. **`/docs/DECISIONS.md`** — 24 ADRs explaining why each choice was made
8. **`/docs/RISKS.md`** — hour-by-hour risk register + go/no-go checkpoints

If any doc contradicts another, the priority is: PRD > DATA_MODEL = API_CONTRACT > ARCHITECTURE > DECISIONS > FAILURE_MATRIX > CONCEPTS > RISKS. Flag contradictions back to planning chat.

## 4. Operating principles (non-negotiable)

### Rule 4.1 discipline (Hackathon rule)
- **API-only wrappers are penalized**. Keep the `/lib/` vs `/infra/` separation from ARCHITECTURE §7:
  - `/lib/` = our orchestration (~2000 LOC target): allocation, admission, idempotency, resilience, metrics
  - `/infra/` = vendor adapters (~30 LOC target): QStash publisher/verifier, Redis client
- When naming files / writing commit messages, make the custom work visible.

### Scope discipline
- **PRD §4.3 WON'T is law.** No auth. No real payment gateway. No multi-seat atomic. No multi-train search. No CAPTCHA. No email.
- If tempted to "just add X," re-read PRD §4.3. Reject by reflex.
- P1 items in PRD §4.2 are optional. Only add them if P0 is fully complete and you have >= 4 hours remaining.

### Time discipline
- **10:00 AM Apr 18 is logic freeze** (per RISKS.md §5). After that, NO backend changes — only polish.
- **11:55 AM is submission checkpoint.** Rollback if not clean.
- Two-hour planning budget already used. You have ~17 hours from ~19:30 PM Apr 17.

### Code discipline
- TypeScript strict mode, Zod at every boundary (ADR-013).
- pino JSON to stdout — NO transports (ADR-015, prevents "thread-stream" crash).
- Postgres access via stored functions defined in DATA_MODEL §5. Do not write ad-hoc SQL in handlers.
- Every external call (DB, payment, etc.) wrapped in Cockatiel policy (ADR-010).
- Every response carries `X-Request-ID` header. Every log entry includes it.
- Commit every 30-60 min with meaningful messages. Push to remote.

### Documentation discipline
- Append one line per non-trivial call to `/docs/DECISIONS.md §5 "Running log"`. Format in that file.
- Update `/docs/RISKS.md §5 Running log` when a new risk surfaces.
- Do NOT create new docs outside `/docs/` unless the planning chat approves.

## 5. Build order (17-hour plan)

### Phase 0 — Preflight (19:30-20:00 PM · 30 min)

```bash
# Create the dev folder (if not already)
mkdir trains-and-tracks && cd trains-and-tracks

# Initialize Next.js 14 + App Router + TypeScript + Tailwind
pnpm create next-app@latest . --typescript --tailwind --app --src-dir=false --no-turbo --no-import-alias

# shadcn/ui init (v4 + React 19)
pnpm dlx shadcn@latest init -d

# Core dependencies
pnpm add zod pino @upstash/qstash@2.8.4 @upstash/redis @upstash/ratelimit \
  @supabase/supabase-js postgres cockatiel \
  prom-client@15.1.3 prometheus-remote-write@0.5.1 \
  @vercel/otel recharts motion @gsap/react gsap \
  next-themes class-variance-authority clsx tailwind-merge \
  tw-animate-css ulid

# Dev dependencies
pnpm add -D @types/node typescript tsx vitest

# shadcn components we'll need
pnpm dlx shadcn@latest add button card dialog input label badge table sheet
```

**Project setup verification:**
- `pnpm dev` runs cleanly on http://localhost:3000
- `pnpm build` completes without errors
- TypeScript strict mode enabled in `tsconfig.json`
- `.env.example` file exists with variables listed in §7 below

**External services (create accounts in parallel):**
- Vercel project linked to a Git repo
- Supabase project (Nano tier) with `DATABASE_URL` using port 6543 per DATA_MODEL §9.1
- Upstash QStash token
- Upstash Redis REST URL + token
- Grafana Cloud Mimir write endpoint + access-policy token

**First deploy target:** by 20:30 PM, `/api/healthz` returns 200 on a Vercel preview URL.

---

### Phase 1 — Data layer (20:00-21:00 PM · 1h)

1. Apply all migrations from DATA_MODEL §6 in numeric order. Use Supabase CLI or dashboard SQL editor.
2. Verify: `SELECT COUNT(*), status FROM seats WHERE train_id='12951' GROUP BY status;` returns `500 | AVAILABLE`.
3. Build `lib/db/client.ts` — supabaseAdmin (service_role) + postgres-js with `prepare: false, max: 1`.
4. Build `lib/db/repositories/*.ts` — thin wrappers over `rpc('allocate_seat', {...})` etc.
5. Write a smoke test: `pnpm tsx scripts/smoke-allocate.ts` that calls `allocate_seat` RPC and verifies a seat moves to RESERVED.

**Gate:** seat allocation works via rpc in <50ms on happy path.

---

### Phase 2 — Ingress + Idempotency (21:00 PM-23:00 PM · 2h)

1. `lib/validation/*.ts` — all Zod schemas from API_CONTRACT §9.
2. `lib/idempotency/redis-fence.ts` — Redis `SET NX EX 60`.
3. `lib/idempotency/postgres-authority.ts` — wrap `idempotency_check` RPC.
4. `lib/idempotency/request-hash.ts` — canonical JSON + SHA-256.
5. `lib/admission/rate-limiter.ts` — `@upstash/ratelimit` sliding window for hot path.
6. `lib/admission/queue-depth-gate.ts` — 503 when depth > 2000.
7. `lib/admission/headers.ts` — `Retry-After`, `RateLimit-Policy`, `X-Queue-Depth`.
8. `app/api/book/route.ts` — POST handler per API_CONTRACT §5.1.

**Gate:** `curl -X POST /api/book` with valid body returns 202 Accepted. Second call with same `Idempotency-Key` returns `Idempotent-Replayed: true`.

---

### Phase 3 — Transport + Worker (23:00 PM-01:00 AM · 2h)

1. `infra/qstash/publisher.ts` — thin wrapper over `qstash.publishJSON` with Flow Control key.
2. `infra/qstash/verifier.ts` — re-export `verifySignatureAppRouter`.
3. `lib/allocation/allocate-seat.ts` — wrap `allocate_seat` RPC inside Cockatiel policy.
4. `lib/allocation/hold-state-machine.ts` — the RESERVED <-> CONFIRMED <-> EXPIRED state machine.
5. `lib/payment/mock-service.ts` — idempotent mock with `PAYMENT_FAILURE_RATE` env.
6. `lib/resilience/pg-policy.ts` — Cockatiel wrap(timeout, retry, breaker).
7. `app/api/worker/allocate/route.ts` — QStash consumer per API_CONTRACT §6.1. Follow the 9-step handler pipeline literally.
8. `app/api/book/[jobId]/route.ts` — Edge runtime poll endpoint per API_CONTRACT §5.2.

**Gate:** end-to-end happy path works:
- POST `/api/book` -> 202
- QStash delivers to worker
- Worker allocates seat -> charges mock -> confirms booking
- GET `/api/book/:jobId` -> status CONFIRMED

---

### Phase 4 — Sweeper + Admin + Simulator (01:00-03:00 AM · 2h)

1. `lib/allocation/sweep-expired.ts` — wrap `sweep_expired_holds` RPC.
2. `app/api/sweeper/expire-holds/route.ts` — QStash Schedule target (Signature verified).
3. `app/api/webhooks/qstash-failure/route.ts` — DLQ mirror write.
4. `lib/admission/lua-sliding-log.ts` — **CUSTOM Lua sliding-window-log** (Rule 4.1 ammunition; 100% accuracy).
5. `app/api/admin/dlq/route.ts`, `/retry/route.ts`, `/kill-worker/route.ts`, `/reset/route.ts`.
6. `app/api/simulate/route.ts` — server-side surge generator per ADR-021.

**Set up QStash Schedule:** via Upstash console, add schedule at `*/30 * * * * *` pointing to `https://<your-url>/api/sweeper/expire-holds` (or closest valid cron — QStash uses 5-field cron; use `*/1 * * * *` for every-minute if 30-sec isn't supported and adjust `HOLD_DURATION` to 5 min).

**Gate:** sweeper reclaims expired holds; `POST /api/simulate` runs without system crash.

---

### Phase 5 — Frontend + Observability (03:00-05:00 AM · 2h)

1. `lib/metrics/registry.ts` — prom-client counters + histograms per PRD §5.5.
2. `lib/metrics/pusher.ts` — `prometheus-remote-write` inside `waitUntil`.
3. `lib/logging/logger.ts` — pino child logger factory.
4. `instrumentation.ts` — `@vercel/otel` at 10% sampling (P1 — skip if tight on time).
5. `app/page.tsx` — landing page (hero video + problem story + CTAs).
6. `app/book/page.tsx` — seat grid UI + modal + poll.
7. `app/ops/page.tsx` — Grafana iframe + Recharts hero + Simulate Surge button.
8. `app/api/insights/[metric]/route.ts` — Grafana HTTP API proxy.

**Gate:** full demo flow works end-to-end on deployed URL.

---

### Phase 6 — Nap (05:00-06:00 AM · 1h)

Non-negotiable per RISKS.md R12. Commit WIP before sleeping.

---

### Phase 7 — Polish (06:00-10:00 AM · 4h)

Only if Phase 1-5 are complete. Otherwise use this time to finish Phase 1-5.

1. Dark theme tuning via `@theme` in `app/globals.css`.
2. Space Mono for all metric numbers; Inter for body.
3. Framer Motion page transitions (`app/template.tsx`).
4. GSAP scroll-linked hero animation (landing only) — skip if time tight.
5. shadcn Card/Badge/Dialog styling consistent across /book and /ops.
6. Hero video swap (from generated asset or Pexels fallback).
7. Error state / empty state / loading state polish on every screen.

**No backend changes in this phase.**

---

### Phase 8 — Chaos Testing + Demo Prep (10:00 AM-12:00 PM · 2h)

**GO/NO-GO CHECKPOINT 1 at 10:00 AM** — run RISKS.md §5 checklist. If any criterion fails, enter R1 playbook.

Run all 11 chaos tests from FAILURE_MATRIX §4. Fix anything that fails.

Run through the pre-demo checklist from RISKS.md §6 (1.5 hours of system + demo path + defense prep + physical + mental).

Record backup demo video. Have USB ready.

**GO/NO-GO CHECKPOINT 2 at 11:55 AM** — submission readiness.

## 6. Scaffold commands (exact)

```bash
# Phase 0 preflight — run these in sequence
mkdir trains-and-tracks && cd trains-and-tracks
pnpm create next-app@latest . --typescript --tailwind --app --src-dir=false --no-turbo --no-import-alias
pnpm dlx shadcn@latest init -d
pnpm add zod pino @upstash/qstash@2.8.4 @upstash/redis @upstash/ratelimit \
  @supabase/supabase-js postgres cockatiel \
  prom-client@15.1.3 prometheus-remote-write@0.5.1 \
  @vercel/otel recharts motion @gsap/react gsap \
  next-themes class-variance-authority clsx tailwind-merge \
  tw-animate-css ulid
pnpm add -D @types/node typescript tsx vitest
pnpm dlx shadcn@latest add button card dialog input label badge table sheet

# Apply Supabase migrations
supabase link --project-ref <ref>
supabase db push

# First deploy
vercel --prod

# Verify
curl https://<your-url>/api/healthz
```

## 7. Env vars required (template for `.env.example`)

```bash
# === DATABASE (Supabase) ===
# Runtime: use TRANSACTION pooler (port 6543) — REQUIRED for serverless
DATABASE_URL="postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Migrations only (direct, port 5432)
DIRECT_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres"

# Supabase JS client (PostgREST via HTTPS — works on Edge)
SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# === QUEUE (Upstash QStash) ===
QSTASH_TOKEN="..."
QSTASH_CURRENT_SIGNING_KEY="..."
QSTASH_NEXT_SIGNING_KEY="..."
QSTASH_URL="https://qstash.upstash.io"

# === CACHE (Upstash Redis) ===
UPSTASH_REDIS_REST_URL="https://<id>.upstash.io"
UPSTASH_REDIS_REST_TOKEN="..."

# === METRICS (Grafana Cloud Mimir) ===
GRAFANA_PROM_URL="https://prometheus-prod-<N>-prod-<region>-0.grafana.net/api/prom/push"
GRAFANA_PROM_USER="<numeric-instance-id>"
GRAFANA_PROM_TOKEN="..."

# === Grafana HTTP API (for Recharts proxy) ===
GRAFANA_PROM_READ_URL="https://prometheus-prod-<N>-prod-<region>-0.grafana.net/api/prom"
GRAFANA_PROM_READ_TOKEN="..."

# === ADMIN ===
ADMIN_SECRET="$(openssl rand -hex 32)"

# === APP ===
APP_URL="https://<your-deployment>.vercel.app"
PAYMENT_FAILURE_RATE="0.3"  # 30% injected failures for demo
HOLD_DURATION_SEC="300"      # 5 min in prod; reduce to 10 for hold-expiration demo
```

**Critical:** these env vars must be set in Vercel env for BOTH Preview AND Production.

## 8. Migration order (apply in this exact sequence)

Per DATA_MODEL §6:

```
20260417_000_extensions.sql
20260417_010_enums.sql
20260417_020_trains.sql
20260417_030_seats.sql
20260417_040_idempotency_keys.sql
20260417_050_payments.sql
20260417_060_bookings.sql
20260417_070_dlq_jobs.sql
20260417_100_fn_allocate_seat.sql
20260417_110_fn_confirm_booking.sql
20260417_120_fn_release_hold.sql
20260417_130_fn_sweep_expired_holds.sql
20260417_140_fn_idempotency_check.sql
20260417_150_fn_write_idempotency_response.sql
20260417_900_seed_trains.sql
20260417_910_seed_seats.sql
20260417_160_fk_seats_booking_id.sql
```

Each file's contents are specified in DATA_MODEL.md. Copy SQL verbatim.

## 9. Quality gates per phase

Before moving to the next phase, these must all be green:

**After Phase 1 (data layer):**
- `SELECT COUNT(*), status FROM seats WHERE train_id='12951';` = 500 | AVAILABLE
- `SELECT allocate_seat('12951', 'test-uuid', 'Test User');` returns 1 row

**After Phase 2 (ingress + idem):**
- `curl -X POST /api/book ...` returns 202
- Same request replayed returns `Idempotent-Replayed: true`
- Missing `Idempotency-Key` returns 400

**After Phase 3 (transport + worker):**
- End-to-end booking completes in <5s
- QStash signature verifies (inspect logs)
- `confirm_booking` runs; booking -> CONFIRMED

**After Phase 4 (sweeper + admin + simulator):**
- QStash Schedule calls sweeper every 60s
- `POST /api/simulate` with `{requestCount: 100}` completes
- Post-simulate check: `ingress == confirmed + failed + rate_limited`

**After Phase 5 (frontend + obs):**
- Landing loads hero media
- `/book` renders seat grid (fetched from `/api/seats`)
- `/ops` shows Grafana iframe + at least one Recharts panel
- Metrics visible in Grafana Cloud

**After Phase 7 (polish):**
- Dark theme consistent across all pages
- No console errors on demo path
- All empty/loading/error states present

**Post-Phase 8 (ready for submission):**
- All 10 success criteria from PRD §8 are green
- RISKS.md §6 pre-demo checklist complete
- Backup demo video recorded
- Presentation deck ready

## 10. Escalation — when to stop and ask

Stop and message the planning chat (user will pass to me) when:

1. **Any doc contradicts another** and you can't resolve via the priority order in §3.
2. **A failure mode is not covered in FAILURE_MATRIX.md** — planning chat updates the doc, not you.
3. **You hit a risk with score >= 20** (per RISKS.md §1).
4. **PRD scope is ambiguous** — default to WON'T if uncertain, but flag.
5. **A library version in ARCHITECTURE §5 doesn't install** — pin may have shifted; planning chat confirms new pin.
6. **You discover a rule 4.1 concern** — planning chat reviews framing.

Do NOT stop to ask for:
- Styling choices (you have shadcn + Tailwind v4 — use taste)
- Copy text (use the PRD §10 demo script as the tone)
- Error message wording (use canonical `error.code` from API_CONTRACT §3)
- File organization within the `lib/` folders (follow ARCHITECTURE §7)

## 11. Running log maintenance

As you work, append to `/docs/DECISIONS.md §5`. Format:

```
## [YYYY-MM-DD HH:MM IST] <ad-hoc or ADR-NNN>: <one-line summary>
- context: (why this came up)
- decision: (what we chose)
- file(s): (paths where this appears)
```

**Don't** rewrite the ADRs in §3. Only append to §5.

## 12. Frontend aesthetic spec (compressed from planning chat)

- Base: `#0A0A0A` bg, Space Mono for numbers/labels, Inter for body
- Accent: signal green `#00D084` (or electric blue `#007AFF`) — pick one and stick
- Landing hero: train station at 10:00 AM video loop + "THIS IS WHAT HUNGRY FOR TICKETS LOOKS LIKE" headline
- `/book`: minimalist seat grid (CSS grid, each seat a small square with state color)
- `/ops`: Linear/Grafana aesthetic — 6-panel grid of live metrics + big red "SIMULATE TATKAL SURGE" button with glow
- HUD touches on `/ops`: pulsing green dot for SYSTEM HEALTHY, dashed line from "Rate Limiter" pill to the 429 count panel
- NO on booking page: animations, HUD chrome, decorative elements

## 13. Rule 4.1 compliance reminders (baked into every phase)

Named custom logic modules you MUST build (these are the Rule 4.1 ammunition):

- `lib/admission/lua-sliding-log.ts` — 100%-accurate Lua rate limiter
- `lib/idempotency/postgres-authority.ts` — CTE+UNION insert-or-return
- `lib/idempotency/request-hash.ts` — canonical JSON SHA-256
- `lib/allocation/hold-state-machine.ts` — state transitions in code
- `lib/resilience/pg-policy.ts` — Cockatiel policy composition (threshold tuning + wrap order)
- `lib/metrics/registry.ts` + `lib/metrics/pusher.ts` — metric catalog + remote-write pipeline
- `app/api/sweeper/expire-holds/route.ts` — advisory-lock-guarded worker

Make these files >= 50 LOC each with meaningful comments. Total `/lib` >= 2000 LOC target.

Make `/infra/qstash/*.ts` and `/infra/redis/*.ts` as thin as possible — <= 30 LOC each.

## 14. Commit message conventions

Use Conventional Commits:

- `feat(allocate): add SKIP LOCKED seat allocation RPC wrapper`
- `feat(idempotency): implement Redis NX + Postgres UNIQUE two-layer fence`
- `fix(sweeper): use pg_try_advisory_xact_lock to prevent concurrent runs`
- `chore(migrate): apply data model migrations 000-910`
- `docs(decisions): append running log entry for QStash version pin`

## 15. First task (do this first)

After reading the 8 docs, your very first action is:

```bash
# Read the docs
ls -la /Users/praanshu/hackathon\ chat/docs/

# Cat the priority order
cat /Users/praanshu/hackathon\ chat/docs/PRD.md
cat /Users/praanshu/hackathon\ chat/docs/ARCHITECTURE.md
cat /Users/praanshu/hackathon\ chat/docs/DATA_MODEL.md
cat /Users/praanshu/hackathon\ chat/docs/API_CONTRACT.md
# ... etc
```

Then respond with:
- A one-paragraph confirmation that you've read + understood the 8 docs.
- The exact Vercel + Supabase + Upstash + Grafana accounts needed (from §7 env vars).
- A note on any doc contradiction you spotted.
- "Starting Phase 0 preflight at [timestamp]."

Only after this confirmation do you run the scaffold commands.

---

## 16. The non-negotiables

1. Read all 8 docs before writing code.
2. PRD §4.3 WON'T list is law. Reject scope creep by reflex.
3. Rule 4.1 compliance — name the custom work visibly.
4. Two-layer idempotency (Redis NX + Postgres UNIQUE).
5. `FOR UPDATE SKIP LOCKED` in single-statement UPDATE.
6. QStash Flow Control `key: 'train:' + trainId, parallelism: 1`.
7. Cockatiel policy wrapping all external calls.
8. Nap at 5 AM.
9. Logic freeze at 10 AM.
10. Pre-demo checklist before 11:55 AM submission.

Go.
