// Fire N parallel POST /api/book with unique idempotency keys, report status distribution.

import { randomUUID } from 'node:crypto';

const BASE = process.env.APP_URL ?? 'https://trains-and-tracks.vercel.app';
const N = Number(process.argv[2] ?? 110);

async function one(i: number): Promise<number> {
  const key = randomUUID();
  const res = await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({
      trainId: '12951',
      passengerName: `RL burst ${i}`,
      passengerPhone: '+919876543210',
    }),
  });
  return res.status;
}

(async () => {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => one(i)));
  const ms = Date.now() - t0;
  const dist = new Map<number, number>();
  for (const s of results) dist.set(s, (dist.get(s) ?? 0) + 1);
  console.log(`fired ${N} in ${ms}ms from single Node process`);
  for (const [code, count] of [...dist].sort((a, b) => b[1] - a[1])) {
    console.log(`  HTTP ${code}: ${count}`);
  }
})();
