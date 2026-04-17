// End-to-end: fire N bookings and poll each to terminal state.
// Prints seat allocation, failure reasons, and the zero-duplicate invariant check.

import { randomUUID } from 'node:crypto';
import { sql } from '../lib/db/pg';

const BASE = process.env.APP_URL ?? 'https://trains-and-tracks.vercel.app';
const N = Number(process.argv[2] ?? 10);
const POLL_INTERVAL_MS = 800;
const POLL_MAX_MS = Number(process.env.POLL_MAX_MS ?? 120_000);

interface BookResponse {
  jobId: string;
  status: string;
  trainId: string;
}

async function book(i: number): Promise<{ idempotencyKey: string; jobId: string }> {
  const key = randomUUID();
  const res = await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({
      trainId: '12951',
      passengerName: `E2E burst ${i}`,
      passengerPhone: '+919876543210',
    }),
  });
  if (res.status !== 202) {
    throw new Error(`book #${i} HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as BookResponse;
  return { idempotencyKey: key, jobId: body.jobId };
}

async function pollUntilTerminal(jobId: string): Promise<{ status: string; seatId: string | null; failureReason: string | null }> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/book/${jobId}`);
    const body = (await res.json()) as { status: string; seatId: string | null; failureReason: string | null };
    if (body.status !== 'PENDING') return body;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`poll timeout for ${jobId}`);
}

(async () => {
  console.log(`firing ${N} bookings at ${BASE}`);
  const t0 = Date.now();

  const bookings = await Promise.all(Array.from({ length: N }, (_, i) => book(i)));
  const tBooked = Date.now();
  console.log(`all ${N} accepted (202) in ${tBooked - t0}ms`);

  const final = await Promise.all(bookings.map((b) => pollUntilTerminal(b.jobId)));
  const tDone = Date.now();
  console.log(`all ${N} terminal in ${tDone - t0}ms total (${tDone - tBooked}ms polling)\n`);

  const byStatus = new Map<string, number>();
  const byReason = new Map<string, number>();
  const seats: string[] = [];
  for (const f of final) {
    byStatus.set(f.status, (byStatus.get(f.status) ?? 0) + 1);
    if (f.failureReason) byReason.set(f.failureReason, (byReason.get(f.failureReason) ?? 0) + 1);
    if (f.seatId) seats.push(f.seatId);
  }
  console.log('by status:', Object.fromEntries(byStatus));
  if (byReason.size > 0) console.log('by failure reason:', Object.fromEntries(byReason));
  console.log(`seats allocated (CONFIRMED): ${seats.length} — sample: ${seats.slice(0, 5).join(', ')}`);

  // Zero-duplicate invariant: no seat appears in two CONFIRMED bookings.
  const dup = await sql<{ seat_id: string; n: number }[]>`
    SELECT seat_id, COUNT(*)::int AS n
      FROM bookings
     WHERE status = 'CONFIRMED' AND seat_id IS NOT NULL
     GROUP BY seat_id
    HAVING COUNT(*) > 1
  `;
  console.log(`duplicate-seat check: ${dup.length === 0 ? 'PASS (0 dups)' : 'FAIL'}`);
  if (dup.length > 0) console.log('  dups:', dup);

  // Seat inventory reconciliation
  const inv = await sql<{ status: string; n: number }[]>`
    SELECT status::text, COUNT(*)::int AS n
      FROM seats WHERE train_id='12951' GROUP BY status
  `;
  console.log('seat inventory:', Object.fromEntries(inv.map(r => [r.status, r.n])));

  await sql.end();
})().catch(async (e) => {
  console.error('FAIL:', e);
  try { await sql.end(); } catch {/* noop */}
  process.exit(1);
});
