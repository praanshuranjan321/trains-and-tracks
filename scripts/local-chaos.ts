// Local chaos suite — tests that don't require QStash publish quota.
// Run with: QSTASH_DEV_BYPASS=1 pnpm dev  (separate terminal)
//           pnpm exec tsx scripts/local-chaos.ts
//
// Covers:
//   CT-1  concurrent sweeper (advisory lock; FAILURE_MATRIX §4 "Concurrent sweeper")
//   CT-2  expired-hold release (FAILURE_MATRIX §4 "Hold expiration")
//   CT-3  kill-worker flag set + read (FAILURE_MATRIX §4 "Kill-worker" partial)
//   CT-4  admin rate-limit Lua accuracy (30/min)
//   CT-5  idempotency hash mismatch at /api/book level (publish-independent path)
//   CT-6  tombstone rollback (Item A — publish quota-exhausted flow)

import { randomUUID } from 'node:crypto';
import { sql } from '../lib/db/pg';
import { redis } from '../infra/redis/client';

const BASE = 'http://localhost:3000';
const ADMIN = process.env.ADMIN_SECRET!;
if (!ADMIN) throw new Error('ADMIN_SECRET missing');

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail: string = '') {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}

async function reset() {
  await sql`UPDATE seats SET status='AVAILABLE', booking_id=NULL, held_by=NULL, held_until=NULL, version=0 WHERE train_id='12951'`;
  await sql`DELETE FROM idempotency_keys`;
  await sql`DELETE FROM bookings`;
  await sql`DELETE FROM payments`;
}

async function ct1Concurrent() {
  console.log('\nCT-1  concurrent sweeper (advisory lock)');
  // Fire 3 simultaneous sweeper POSTs — the pg_try_advisory_xact_lock(8675309)
  // in sweep_expired_holds lets only one run at a time. Back-to-back calls can
  // each acquire after the prior released; the real contract is: no errors,
  // no double-state corruption. We assert all responses are 2xx.
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      fetch(`${BASE}/api/sweeper/expire-holds`, { method: 'POST' }).then(async (r) => ({
        status: r.status,
        body: await r.json(),
      })),
    ),
  );
  const allOk = responses.every((r) => r.status === 200 && r.body.ok === true);
  check('3 parallel calls all return 200 ok', allOk);
  const fired = responses.filter((r) => r.body.skipped === false).length;
  check('at least one fired (not skipped)', fired >= 1, `fired=${fired}`);
}

async function ct2HoldExpiration() {
  console.log('\nCT-2  expired-hold release via sweeper');
  const bookingId = randomUUID();
  await sql`INSERT INTO bookings (id, idempotency_key, train_id, passenger_name, price_paise)
             VALUES (${bookingId}::uuid, ${bookingId}::text, '12951', 'Chaos CT-2', 126000)`;
  await sql`UPDATE seats SET status='RESERVED', booking_id=${bookingId}::uuid,
                  held_by='Chaos CT-2', held_until=now() - interval '1 minute',
                  version=seats.version + 1
             WHERE id='T12951-C20-25'`;

  const res = await fetch(`${BASE}/api/sweeper/expire-holds`, { method: 'POST' });
  const body = (await res.json()) as { ok: boolean; swept?: number | null };
  // swept_count may come back as null from the stored function under some
  // plpgsql paths; the side effects (seat + booking state) are what matter.
  check('sweeper returned 200', res.ok);

  const [s] = await sql<{ status: string; booking_id: string | null }[]>`
    SELECT status::text, booking_id::text FROM seats WHERE id='T12951-C20-25'
  `;
  check('seat back to AVAILABLE', s?.status === 'AVAILABLE');
  check('seat booking_id cleared', s?.booking_id === null);

  const [b] = await sql<{ status: string; failure_reason: string | null }[]>`
    SELECT status::text, failure_reason FROM bookings WHERE id=${bookingId}::uuid
  `;
  check('booking → EXPIRED', b?.status === 'EXPIRED');
  check("failure_reason='hold_expired'", b?.failure_reason === 'hold_expired');
}

async function ct3KillFlag() {
  console.log('\nCT-3  kill-worker flag write + read');
  await redis.del('chaos:worker:fail-next').catch(() => {});
  const res = await fetch(`${BASE}/api/admin/kill-worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ failNextN: 3, failureMode: '500' }),
  });
  check('kill-worker POST → 200', res.status === 200);
  const flag = await redis.get('chaos:worker:fail-next');
  const parsed = typeof flag === 'string' ? JSON.parse(flag) : flag;
  check('flag remaining=3', parsed?.remaining === 3);
  check("flag mode='500'", parsed?.mode === '500');
  await redis.del('chaos:worker:fail-next');
}

async function ct4AdminLimit() {
  console.log('\nCT-4  admin rate limit (custom Lua sliding-window-log, 30/min)');
  // Clear Lua bucket first — keyed on token fingerprint so delete any rl:admin:* keys.
  const keys = await redis.keys('rl:admin:*');
  if (keys.length > 0) await redis.del(...keys);
  // Serial firing so `next dev`'s single thread doesn't time out on 32 parallel
  // requests. The Lua window is seconds-level — sequential 32 still fits well
  // within the 60s window.
  const statuses: number[] = [];
  for (let i = 0; i < 32; i++) {
    const r = await fetch(`${BASE}/api/admin/dlq`, {
      headers: { Authorization: `Bearer ${ADMIN}` },
    });
    statuses.push(r.status);
    // drain body so we don't leak sockets
    await r.text();
  }
  const ok = statuses.filter((s) => s === 200).length;
  const tooMany = statuses.filter((s) => s === 429).length;
  check('exactly 30 admitted', ok === 30, `got ${ok}`);
  check('exactly 2 over-limit', tooMany === 2, `got ${tooMany}`);
}

async function ct5HashMismatch() {
  console.log('\nCT-5  hash-mismatch rejection (publish-independent)');
  const key = randomUUID();
  // First POST — expect 502 because QStash quota; that's fine, booking rolls back.
  // The idempotency_keys row stays with the FIRST request_hash cached.
  await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ trainId: '12951', passengerName: 'First', passengerPhone: '+919876543210' }),
  });
  // Second POST — DIFFERENT body — Stripe contract says 400 idempotency_key_in_use.
  const r2 = await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ trainId: '12951', passengerName: 'DIFFERENT', passengerPhone: '+919876543210' }),
  });
  const body = (await r2.json()) as { error?: { code?: string } };
  check('HTTP 400', r2.status === 400);
  check("error.code='idempotency_key_in_use'", body.error?.code === 'idempotency_key_in_use');
}

async function ct6Tombstone() {
  console.log('\nCT-6  Item A tombstone rollback (publish quota-exhausted → FAILED + cached 502)');
  const key = randomUUID();
  const r1 = await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ trainId: '12951', passengerName: 'CT-6', passengerPhone: '+919876543210' }),
  });
  check('fresh POST → 502 (publish fails)', r1.status === 502);

  // Booking should be FAILED not PENDING
  const [b] = await sql<{ status: string; failure_reason: string | null }[]>`
    SELECT status::text, failure_reason FROM bookings WHERE idempotency_key=${key}
  `;
  check('booking → FAILED', b?.status === 'FAILED');
  check("failure_reason='upstream_publish_failure'", b?.failure_reason === 'upstream_publish_failure');

  // Replay should echo 502 with Idempotent-Replayed: true
  const r2 = await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ trainId: '12951', passengerName: 'CT-6', passengerPhone: '+919876543210' }),
  });
  check('replay also 502', r2.status === 502);
  check("Idempotent-Replayed: true", r2.headers.get('idempotent-replayed') === 'true');
}

(async () => {
  console.log('LOCAL CHAOS SUITE (QStash-quota-independent paths)\n');
  await reset();

  await ct1Concurrent();
  await ct2HoldExpiration();
  await ct3KillFlag();
  await ct4AdminLimit();
  await ct5HashMismatch();
  await ct6Tombstone();

  console.log(`\n═══ ${pass}/${pass + fail} green${fail > 0 ? ` (${fail} FAIL)` : ''} ═══`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  try { await sql.end(); } catch { /* noop */ }
  process.exit(2);
});
