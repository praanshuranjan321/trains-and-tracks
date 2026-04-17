# Trains and Tracks — Risk Register

**Version:** 1.0 · **Status:** Living doc · **Date:** 2026-04-17

---

## 1. Risk Philosophy

A 17-hour solo build has three risk classes that kill projects:

1. **Time risks** — scope creep, polish squeeze, planning overflow. The #1 hackathon killer.
2. **Technical risks** — known-broken interactions documented in the dossier (Vercel x Supavisor pool leak, `ON CONFLICT DO NOTHING RETURNING`, prom-client on serverless).
3. **Demo risks** — venue conditions, unrehearsed Q&A, live-failure visibility.

**The risk-scoring model:** each risk carries a **Severity** (1-5: inconvenience -> disqualification) and **Likelihood** (1-5: improbable -> certain). **Risk Score = S x L.** Anything >= 12 gets a named mitigation and a contingency plan.

**The 1-in-100 rule:** any risk with Likelihood x Severity >= 20 is a go/no-go checkpoint trigger. If we hit one, we cut scope or pivot — we do not push through.

---

## 2. Master Risk Register

Ordered by risk score (S x L), descending. The top 10 get playbooks in §4.

| # | Risk | Sev | Like | Score | Mitigation (primary) | Contingency |
|---|---|---|---|---|---|---|
| R1 | Logic not working end-to-end by hour 10 (2 AM) | 5 | 4 | **20** | Strict phase-1 MUST-only scope; cut P1 features at checkpoint | Ship with fewer features; correctness > completeness |
| R2 | Demo system fails live in front of judges | 5 | 3 | **15** | Chaos-test everything before 10 AM; record backup demo video | Play backup video; narrate from deck |
| R3 | Vercel Fluid + Supavisor pool leak (Nov 2025 bug) | 4 | 3 | **12** | Monitor `pg_stat_activity.numbackends`; env flag for direct-URL fallback | Disable Fluid via vercel.json; restart |
| R4 | Polish phase squeezed to <3 hours | 4 | 3 | **12** | Hard logic-freeze at hour 10 regardless of state | Ship ugly-but-working; no polish is fine, broken UI is not |
| R5 | QStash signature verification fails (raw body issue) | 5 | 2 | **10** | Never parse+restringify before `verifySignatureAppRouter`; test with curl before demo | Bypass sig in dev; re-enable in prod |
| R6 | Venue wifi poor; demo hangs | 4 | 3 | **12** | Hotspot backup; server-side `/api/simulate` (not browser fetch) | Record demo video in advance |
| R7 | Postgres connection pool exhausts mid-demo | 4 | 3 | **12** | `connection_limit=1` + circuit breaker + monitor `numbackends` | Show circuit-breaker 503 behavior as intentional demonstration |
| R8 | Idempotency race not tested; duplicate booking in demo | 5 | 2 | **10** | Chaos-test §4.3 catches this; three-layer backstop | Abort current demo run; reset state; try again |
| R9 | `ON CONFLICT DO NOTHING RETURNING` returns 0 rows, breaks idem | 4 | 2 | **8** | CTE+UNION pattern in `idempotency_check` function | Fix inline; redeploy |
| R10 | Grafana iframe slow on venue wifi | 3 | 4 | **12** | Native Recharts hero as primary; iframe secondary | Show Recharts only; screenshot of Grafana in slides |
| R11 | Hero video not generated / poor quality | 3 | 3 | **9** | Queue Pexels fallback early; one take max | Stock image in place of video |
| R12 | Developer fatigue -> 4 AM decision errors | 4 | 4 | **16** | Non-negotiable 5-6 AM nap; avoid architectural changes after 3 AM | Defer judgment calls to morning |
| R13 | Scope creep (adding auth / real payment / multi-seat) | 4 | 3 | **12** | PRD §4.3 WON'T list is law; every addition requires explicit reversal | Reject by reflex |
| R14 | QStash free tier exceeded during simulate-surge | 2 | 5 | **10** | Acknowledged in PRD §7.2; $1-2 budget OK | Pay overage; continue **(REALIZED 2026-04-18 02:50 IST during Phase 3 bigger-burst attempt; resolved via pay-as-you-go upgrade, see §5 log)** |
| R15 | Env vars missing in Vercel production deploy | 4 | 3 | **12** | `.env.example` template; deploy checklist §6 | Rotate keys via UI; redeploy |
| R16 | Supabase migration ordering error (FK before referenced table) | 3 | 3 | **9** | Numbered migrations 000->900 in DATA_MODEL.md §6 | Drop + recreate via `supabase db reset` |
| R17 | prom-client scrape returns garbage (per-instance counters) | 3 | 2 | **6** | Push via remote_write per ADR-008 | Disable metrics; demo works without them |
| R18 | Pino transport crash on Vercel | 3 | 2 | **6** | Use stdout JSON only (no `pino.transport`) | Comment out pino calls; `console.log` fallback |
| R19 | Judge asks unprepped question | 3 | 4 | **12** | CONCEPTS.md §14 20-question rapid-fire + §15 safety-net line | Use safety-net line; redirect to strength |
| R20 | Git commits skipped; last-minute merge conflicts | 4 | 2 | **8** | Commit every 30-60 min; push to remote | Restore from GitHub; rewrite lost hour |
| R21 | Laptop battery / charger failure | 5 | 1 | **5** | Dual-laptop; spare charger | Use teammate's laptop; finish on that |
| R22 | Tailwind v4 / shadcn v4 breaking changes | 3 | 2 | **6** | Follow shadcn init output; use `tw-animate-css` not deprecated pkg | Downgrade to v3 if broken |
| R23 | Demo reset button deletes data mid-demo | 4 | 2 | **8** | `confirm: "reset"` required + admin auth; don't bind to visible key | Re-seed from migration script |
| R24 | Grafana Cloud metric series quota exceeded | 2 | 2 | **4** | Limit label cardinality; no unbounded tags | Drop high-cardinality metrics |
| R25 | Simulator fires too fast, hits Vercel CPU limit | 3 | 3 | **9** | Stagger with `setTimeout` in `/api/simulate` | Reduce `requestCount` param |
| R26 | Two concurrent sweeper runs corrupt state | 4 | 1 | **4** | `pg_try_advisory_xact_lock(8675309)` guard | Lock released at txn end; no cleanup needed |
| R27 | Hold expires mid-confirm (worker races sweeper) | 3 | 2 | **6** | `confirm_booking` returns 0 rows if expired; refund triggered | Booking -> EXPIRED; documented in FAILURE_MATRIX §3.2 |
| R28 | Forgotten to run chaos tests before demo | 5 | 3 | **15** | Bullet #1 in §6 pre-demo checklist | Accept higher demo risk; don't hide failure if it happens |
| R29 | Forgotten to run CONCEPTS.md rehearsal | 4 | 3 | **12** | Bullet #2 in §6 pre-demo checklist | Use safety-net line aggressively |
| R30 | Judge reviews code and finds "wrapper" pattern | 4 | 2 | **8** | Rule 4.1 framing in README + DECISIONS.md | Show `/lib` vs `/infra` ratio (2000 vs 30 LOC) |

---

## 3. Hour-by-Hour Risk Timeline

Risks peak at specific moments in the 17-hour window. Each row names the dominant risk for that phase and the single thing to watch.

| Hour | Phase | Dominant risk | What to watch |
|---|---|---|---|
| **17:30-19:30 PM** | Planning | Planning overflow into dev time | Strict 2-hour cap; by 19:30 PM the spec must be done |
| **19:30-20:30 PM** | Scaffold | Env misconfig; first deploy fails | Vercel preview URL returns 200 on `/api/healthz` by 20:30 |
| **20:30 PM-1 AM** | Backend core | Idempotency edge cases; DO NOTHING RETURNING footgun | Run contract tests continuously; Postgres EXPLAIN on allocation query |
| **1-5 AM** | Frontend core | Fatigue-driven architecture changes | No schema changes after 3 AM; stick to the plan |
| **5-6 AM** | Nap | Temptation to skip sleep -> 7 AM bugs | Set alarm; commit WIP before sleeping |
| **6-10 AM** | Polish | Polish bugs breaking known-working flows | Don't refactor; only style/animate/image-swap |
| **10 AM** | **LOGIC FREEZE** | — | **Go/no-go checkpoint 1** — see §5 |
| **10-11:30 AM** | Testing + demo prep | Chaos test reveals late bug | Last fix window; if not fixable in 15 min, SKIP feature |
| **11:30 AM-12 PM** | Phase 2 polish + final deploy | Broken production redeploy | Vercel rollback to last-known-good immediately |
| **12 PM** | **SUBMISSION** | — | **Go/no-go checkpoint 2** — see §5 |
| **12-4 PM** | Demo presentations | Live failure; unprepped question | Backup video on USB; §6 pre-demo checklist run |

---

## 4. Top-10 Risk Playbooks

### R1 — Logic not working end-to-end by hour 10

**Triggering signal:** at 2:00 AM, no happy-path booking has reached CONFIRMED status on the deployed URL.

**Playbook:**
1. **STOP adding features.** Cut P1 scope entirely.
2. Check the first broken step: validate -> rate-limit -> idem-insert -> queue-publish -> worker-receive -> allocate -> pay -> confirm.
3. Use `curl` to exercise each endpoint in isolation. If QStash is the problem, bypass it: directly `await` the worker handler from ingress for the rest of the build.
4. If the sweeper is broken, disable it (skip the P0 hold-release). The demo can use 24h TTL instead of 5 min.
5. If Recharts is broken, show only the Grafana iframe.
6. If the Grafana iframe is broken, show only the Recharts.
7. **Minimum viable demo:** one successful booking + one rejection + the README architecture diagram. That still satisfies PRD §8 criterion 2/3/9/10.

### R2 — Demo fails live in front of judges

**Triggering signal:** during demo, a panel shows an error / a button doesn't respond / the booking hangs.

**Playbook:**
1. Acknowledge it out loud — *"This is the retry-after behavior I was about to demonstrate. Let me show you the failure mode intentionally."* (Reframe as intentional chaos.)
2. Switch to backup video (recorded the night before; USB stick in pocket).
3. If the entire system is down, open the slide deck's architecture diagram and narrate from there. Emphasize the defense docs — "I'd rather show you the thought process than a broken demo."
4. Never lie. "We had this working earlier; let me show you the code path" is acceptable. "This is running live" when it isn't = disqualification risk.

### R3 — Vercel Fluid + Supavisor pool leak

**Triggering signal:** `pg_stat_activity.numbackends` climbs monotonically during burst test, doesn't return to baseline.

**Playbook:**
1. Check `SELECT usename, application_name, state, count(*) FROM pg_stat_activity GROUP BY 1,2,3;` — look for hundreds of idle connections.
2. Set env var `VERCEL_FLUID_DISABLED=true` (if our code respects it) or redeploy with `vercel.json { "functions": { "app/api/**": { "maxDuration": 60 } }}` and disable Fluid in project settings.
3. Alternative: switch `DATABASE_URL` to direct connection `db.<ref>.supabase.co:5432` temporarily. `connection_limit=1` still applies.
4. Restart Vercel deployment; verify pool stabilizes.

### R4 — Polish phase squeezed

**Triggering signal:** at 6 AM, logic bugs still being fixed.

**Playbook:**
1. Abandon polish below 3 hours remaining. Ship the plain-shadcn dark theme.
2. Replace Recharts hero with a static screenshot of Grafana.
3. Drop the hero video; use a single stock image from Pexels.
4. Ugly-but-working UI with live metrics > beautiful-but-broken.

### R5 — QStash signature verification fails

**Triggering signal:** all `/api/worker/allocate` requests return `401 invalid_qstash_signature`.

**Playbook:**
1. Check: `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` both set in Vercel env (for Production AND Preview).
2. Check: worker handler is wrapped in `verifySignatureAppRouter(handler)` — not `verifySignature`.
3. Check: body is read via `await req.json()` only **inside** the handler after wrapper — wrapper reads raw body itself.
4. Local test: `curl -X POST https://<your-url>/api/qstash-test` with a test payload and header from QStash console.
5. Last resort: wrap with a one-liner that logs and returns 200 (bypassing sig) — demo only; remove after.

### R6 — Venue wifi poor

**Triggering signal:** landing page loads slowly or times out.

**Playbook:**
1. Turn on phone hotspot (pre-tested the night before).
2. Backup: record demo video using local wifi at home, bring on USB.
3. `/api/simulate` runs server-side in Vercel -> isn't affected by venue wifi.

### R7 — Postgres pool exhausts mid-demo

**Triggering signal:** simulate-surge shows circuit breaker opening (503s to simulator).

**Playbook:**
1. **This is actually the intended demo behavior.** Frame it: *"Now watch — the system refuses new work rather than hanging. Honest backpressure."*
2. Show the Grafana breaker-state panel (`tg_breaker_state{dep="postgres"}=2`).
3. Wait 30s for breaker half-open; demo recovery.
4. If breaker doesn't reopen: run `/api/admin/reset` to drain state; retry.

### R8 — Idempotency race causes duplicate booking in demo

**Triggering signal:** `SELECT seat_id, COUNT(*) FROM bookings WHERE status='CONFIRMED' GROUP BY 1 HAVING COUNT(*) > 1;` returns a row.

**Playbook:**
1. **This must not happen in demo.** If detected during pre-demo testing: abort, debug, redeploy.
2. Check the three-layer backstop: Redis NX, `idempotency_keys` UNIQUE, `bookings` UNIQUE. All three should log something.
3. If you see it DURING a demo: stop, say *"Our verification query just flagged a duplicate. Let me show you the DLQ and how we'd trace it."* — turn it into a "correctness is testable" moment rather than hiding.
4. Most likely cause: worker didn't check `bookings.status` before allocating. Fix: add guard at top of `/api/worker/allocate`.

### R12 — Developer fatigue at 4 AM

**Triggering signal:** you catch yourself re-reading the same error message three times.

**Playbook:**
1. Stop. Commit your current state (even broken).
2. Sleep 60 min minimum. Set alarm. Eye mask.
3. Resume at 5 AM fresh. Review what you tried; 70% of 4 AM bugs disappear by 6 AM.

### R28 / R29 — Skipped chaos tests / skipped rehearsal

**Playbook:** this is prevented by §6 pre-demo checklist being non-skippable. If you're tempted to skip, you've already lost 10-15% of your score.

---

## 5. Go/No-Go Checkpoints

### Checkpoint 1 — 10:00 AM (logic freeze)

**Go criteria (ALL must be true):**
- [ ] Happy-path booking end-to-end works on deployed URL
- [ ] `/api/simulate` completes without system crash
- [ ] Post-surge query: 500 CONFIRMED, 0 duplicates (DATA_MODEL.md §10)
- [ ] `/ops` dashboard shows at least 3 live metrics

**If any fail:** enter the R1 playbook. Cut scope aggressively. You have 1 hour 30 min (10 AM-11:30 AM) to either fix or cut.

**If all pass:** proceed to polish/rehearsal phase. Do NOT touch backend code.

### Checkpoint 2 — 11:55 AM (submission)

**Go criteria (ALL must be true):**
- [ ] Deployed URL returns 200 on `/api/healthz`
- [ ] Landing page loads hero media + CTAs
- [ ] Booking flow completes at least one booking within 30s
- [ ] Grafana dashboard URL accessible
- [ ] Backup demo video on USB (if primary demo fails)
- [ ] PPT / presentation deck saved locally AND in cloud

**If any fail:** do not submit broken state. Revert to last-known-good Vercel deployment (one click in Vercel UI).

**If all pass:** submit. Move to demo.

---

## 6. Pre-Demo Checklist (run at 10:00 AM)

**Systems (30 min):**

- [ ] Run all 11 chaos tests from FAILURE_MATRIX §4 against deployed URL
- [ ] Verify `SELECT COUNT(*), status FROM seats;` returns correct counts
- [ ] Verify `SELECT seat_id, COUNT(*) FROM bookings GROUP BY 1 HAVING COUNT(*) > 1;` returns 0 rows
- [ ] Verify `/api/healthz` returns `status: healthy`
- [ ] Verify `pg_stat_activity.numbackends` < 50

**Demo path (30 min):**

- [ ] Open `/` — hero video plays
- [ ] Open `/book` — seat grid renders
- [ ] Book seat 1 -> confirmed within 5s
- [ ] Open `/ops` — dashboard renders with live metrics
- [ ] Run simulate-surge -> panels update -> final state 500 confirmed
- [ ] Press kill-worker -> retries visible -> still 500 confirmed
- [ ] Run `/api/admin/reset` -> verify state resets

**Defense prep (30 min):**

- [ ] Re-read CONCEPTS.md §14 (20 Q&A) aloud
- [ ] Re-read DECISIONS.md ADR-001 through ADR-012
- [ ] Open README architecture diagram; confirm Mermaid renders
- [ ] Verify DLQ has >= 1 entry if demo-ing DLQ page

**Physical (15 min):**

- [ ] Laptop charged to 100%
- [ ] Charger in bag
- [ ] Phone hotspot tested
- [ ] USB with backup video
- [ ] Water bottle

**Mental (5 min):**

- [ ] Read the 60-second demo script in PRD §10 once
- [ ] Note the three defense lines from PRD §1
- [ ] Remind yourself: partial knowledge > bluffing (CONCEPTS §15 safety-net line)

---

## 7. Pre-Mortem: The 5 Failure Scenarios We Most Fear

Imagine the demo just failed. What would the post-mortem say? Pre-answering these reveals blind spots.

### Scenario 1: "We couldn't finish the backend"
**Root cause:** scope creep, over-engineering, not cutting P1 on time.
**Prevention:** strict MUST-only scope from hour 2; go/no-go at hour 10.

### Scenario 2: "The demo froze live"
**Root cause:** no chaos-testing before demo; untested interaction.
**Prevention:** §6 pre-demo checklist; run every chaos test.

### Scenario 3: "We couldn't defend the code"
**Root cause:** no CONCEPTS.md rehearsal; over-claimed.
**Prevention:** 20-Q rapid-fire aloud the night before; safety-net line ready.

### Scenario 4: "Judges flagged us as an API wrapper (Rule 4.1 violation)"
**Root cause:** QStash SDK imports dominated the ratio instead of custom code.
**Prevention:** `/lib` structure (2000 LOC) clearly separate from `/infra` (30 LOC); README ownership map.

### Scenario 5: "The system broke during a judge's hands-on test"
**Root cause:** hidden bug that only surfaces under specific input; no contract tests.
**Prevention:** contract tests in `tests/contract/`; run them against deployed URL at 10 AM checkpoint.

---

## 8. Escape Hatches (the "oh no" list)

One-liners for when everything goes wrong:

| If X breaks | Do this |
|---|---|
| QStash signature verification | Wrap handler so it checks env flag `QSTASH_BYPASS=true`, returns 200 on any body (demo only) |
| Supavisor pool leak | Flip `DATABASE_URL` to direct (port 5432) in Vercel env, redeploy |
| Fluid Compute quirks | `vercel.json` with `fluidCompute: false` and redeploy |
| Grafana iframe won't load | Take screenshot, add to slide deck; show Recharts only in `/ops` |
| Hero video gen fails | Pexels `indian railway station crowded` stock loop |
| Simulate-surge crashes | Reduce to 10K requests over 20s; redeploy |
| Circuit breaker won't reset | `/api/admin/reset` + restart Vercel deployment |
| Postgres migration broken | `supabase db reset` then re-apply migrations in order |
| Entire deployment broken | Vercel UI -> Previous Deployments -> "Promote to Production" on last-known-good |
| Laptop dies during demo | Phone-based demo: show recorded video, narrate from slide deck |

---

## 9. Risk Ownership

Since this is a solo build, all risks are owned by the builder. But specific mitigations can be delegated:

| Risk class | Who owns mitigation | When |
|---|---|---|
| Planning overflow | Self (strict clock) | hours 1-2 |
| Implementation bugs | Dev chat (Claude Code) | hours 2-10 |
| Polish quality | Polish chat (new Claude Code) | hours 10-16 |
| Defense prep | Self (read + rehearse) | hours 15-17 |
| Demo execution | Self (checklist) | hour 17 onwards |

---

## 10. Summary

- **30 risks** enumerated, each with severity x likelihood x mitigation x contingency.
- **Top 10** get detailed playbooks in §4.
- **Hour-by-hour timeline** maps risks to their peak window.
- **Two go/no-go checkpoints** (10 AM logic freeze, 11:55 AM submission) prevent escalation.
- **Pre-demo checklist** is the single highest-leverage hour of the entire build.
- **Five pre-mortem scenarios** were written BEFORE they could happen — most are now preventable.
- **Escape hatches** in §8 are the "if this breaks, do this" cheatsheet for demo morning.

If you hit three >=12-score risks in the same phase, STOP and reassess. Pushing through three active risks at once is how projects fail.

---

**Final doc:** `DEV_BRIEF.md` — the exact prompt to paste into your dev Claude Code chat to start the build.
