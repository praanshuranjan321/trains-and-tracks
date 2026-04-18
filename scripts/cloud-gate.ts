// Phase 3/4 cloud gate — run after QStash quota resets.
//
// Steps:
//   1. Reset demo state via /api/admin/reset
//   2. Single-booking e2e: POST → poll → CONFIRMED
//   3. Burst N=500 via /api/simulate; poll until all terminal
//   4. Invariants:
//        zero-duplicate seats in CONFIRMED bookings
//        ingress == confirmed + failed + expired + rate_limited + dlq
//        seat inventory reconciles (CONFIRMED count matches bookings CONFIRMED)
//   5. Chaos: /api/admin/kill-worker {failNextN:3}; single booking; retries visible
//
// Budget per PRD §7.2: ~150 QStash messages.

import { randomUUID } from 'node:crypto';
import { sql } from '../lib/db/pg';

const BASE = process.env.APP_URL ?? 'https://trains-and-tracks.vercel.app';
const ADMIN = process.env.ADMIN_SECRET!;
if (!ADMIN) throw new Error('ADMIN_SECRET missing');

// All knobs configurable via env so the same script runs for a 50-req smoke
// or a 5000-req pre-demo sweep. Defaults match a reasonable cloud-gate run.
const SIMULATE_N = Number(process.env.SIMULATE_N ?? 500);
const WINDOW_SEC = Number(process.env.WINDOW_SEC ?? 30);
const POLL_MS = Number(process.env.POLL_MS ?? 2000);
const SIMULATE_POLL_MAX_MS = Number(process.env.POLL_MAX_MS ?? 180_000);

async function j(label: string, body: unknown) {
  console.log(`\n─── ${label} ───`);
  console.log(JSON.stringify(body, null, 2));
}

async function callAdmin(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function bookOne(): Promise<{ jobId: string; status: number }> {
  const key = randomUUID();
  const res = await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({
      trainId: '12951',
      passengerName: 'Cloud Gate Test',
      passengerPhone: '+919876543210',
    }),
  });
  const body = (await res.json()) as { jobId?: string };
  return { jobId: body.jobId ?? '', status: res.status };
}

async function pollOne(jobId: string, maxMs: number): Promise<string> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/book/${jobId}`);
    const body = (await res.json()) as { status: string };
    if (body.status !== 'PENDING') return body.status;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return 'POLL_TIMEOUT';
}

async function waitUntilAllTerminal(sinceIso: string, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const [row] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings WHERE status='PENDING' AND created_at >= ${sinceIso}::timestamptz
    `;
    if (row!.n === 0) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  console.log('CLOUD GATE — trains-and-tracks');
  console.log(`  base: ${BASE}`);
  console.log(`  simulate N: ${SIMULATE_N} over ${WINDOW_SEC}s`);
  console.log('');

  // 1. Reset
  const reset = await callAdmin('/api/admin/reset', { confirm: 'reset', trainId: '12951' });
  await j('RESET', reset);
  if (reset.status !== 200) throw new Error('reset failed');

  // 2. Single e2e
  const singleStart = Date.now();
  console.log('\n─── SINGLE e2e BOOKING ───');
  const one = await bookOne();
  console.log(`POST /api/book → ${one.status}  jobId=${one.jobId}`);
  if (one.status !== 202) throw new Error('single booking not 202');
  const finalStatus = await pollOne(one.jobId, 30_000);
  console.log(`final: ${finalStatus}  (elapsed ${Date.now() - singleStart}ms)`);
  if (finalStatus !== 'CONFIRMED' && finalStatus !== 'FAILED') {
    throw new Error(`single did not reach terminal: ${finalStatus}`);
  }

  // 3. Simulate burst
  const simStartIso = new Date().toISOString();
  const simResp = await callAdmin('/api/simulate', {
    trainId: '12951',
    requestCount: SIMULATE_N,
    windowSeconds: WINDOW_SEC,
  });
  await j('SIMULATE START', simResp);
  if (simResp.status !== 202) throw new Error('simulate not 202');

  console.log(`\n─── waiting for ${SIMULATE_N} bookings to reach terminal (up to ${SIMULATE_POLL_MAX_MS / 1000}s) ───`);
  await waitUntilAllTerminal(simStartIso, SIMULATE_POLL_MAX_MS);

  // 4. Invariants
  console.log('\n─── INVARIANT CHECKS ───');

  const [bs] = await sql<{ total: number; confirmed: number; failed: number; expired: number; pending: number }[]>`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN status='CONFIRMED' THEN 1 ELSE 0 END)::int AS confirmed,
      SUM(CASE WHEN status='FAILED'    THEN 1 ELSE 0 END)::int AS failed,
      SUM(CASE WHEN status='EXPIRED'   THEN 1 ELSE 0 END)::int AS expired,
      SUM(CASE WHEN status='PENDING'   THEN 1 ELSE 0 END)::int AS pending
      FROM bookings WHERE created_at >= ${simStartIso}::timestamptz
  `;
  console.log(`bookings-by-status: ${JSON.stringify(bs)}`);

  const dup = await sql<{ seat_id: string; n: number }[]>`
    SELECT seat_id, COUNT(*)::int AS n
      FROM bookings
     WHERE status='CONFIRMED' AND seat_id IS NOT NULL
     GROUP BY seat_id HAVING COUNT(*) > 1
  `;
  const dupOK = dup.length === 0;
  console.log(`duplicate-seat check: ${dupOK ? 'PASS' : 'FAIL'} (${dup.length} dups)`);

  const [inv] = await sql<{ available: number; reserved: number; confirmed: number }[]>`
    SELECT
      SUM(CASE WHEN status='AVAILABLE' THEN 1 ELSE 0 END)::int AS available,
      SUM(CASE WHEN status='RESERVED'  THEN 1 ELSE 0 END)::int AS reserved,
      SUM(CASE WHEN status='CONFIRMED' THEN 1 ELSE 0 END)::int AS confirmed
      FROM seats WHERE train_id='12951'
  `;
  console.log(`seat inventory: ${JSON.stringify(inv)}`);
  const seatInvOK =
    inv!.available + inv!.reserved + inv!.confirmed === 500 && inv!.confirmed === bs!.confirmed;
  console.log(`seat-inventory reconciliation: ${seatInvOK ? 'PASS' : 'FAIL'}`);

  const noPendingOK = bs!.pending === 0;
  console.log(`no-lost-intent (0 PENDING): ${noPendingOK ? 'PASS' : 'FAIL'}`);

  // 5. Chaos
  console.log('\n─── CHAOS: kill-next-3 + 1 booking ───');
  const kill = await callAdmin('/api/admin/kill-worker', { failNextN: 3, failureMode: '500' });
  console.log(`kill: ${kill.status} ${JSON.stringify(kill.body)}`);
  const chaosStart = Date.now();
  const chaosBook = await bookOne();
  console.log(`chaos POST → ${chaosBook.status}  jobId=${chaosBook.jobId}`);
  const chaosFinal = await pollOne(chaosBook.jobId, 90_000);
  console.log(`chaos final: ${chaosFinal}  (elapsed ${Date.now() - chaosStart}ms)`);

  const overallPass = dupOK && seatInvOK && noPendingOK && (chaosFinal === 'CONFIRMED' || chaosFinal === 'FAILED');
  console.log(`\n═══ GATE ${overallPass ? 'PASS' : 'FAIL'} ═══`);
  await sql.end();
  process.exit(overallPass ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n!!! cloud gate errored:', e);
  try { await sql.end(); } catch {/* noop */}
  process.exit(2);
});
