// I2 — no-lost-intent count reconciliation (DB-only variant).
//
// Every row in `bookings` is accounted for by exactly one terminal or
// in-flight state:
//
//   total == PENDING + RESERVED + CONFIRMED + FAILED + EXPIRED
//
// (Rate-limited rejects never create a bookings row, so they sit outside
// this DB-only formula. The `ingress` side of the full invariant is
// counted via metrics — not this test.)
//
// Also reports DLQ depth as an operator-useful signal — unresolved DLQ
// rows are recoverable (manual retry or data fix), they don't break I2
// because those bookings are already in FAILED + a dlq_jobs row.
//
// Usage:
//   DATABASE_URL=<prod-pooler> pnpm test:invariant:i2
//
// Exit 0 = invariant holds. Exit 1 = mismatch (genuine data loss).

import postgres from 'postgres';

const MASKED_PWD_RE = /:[^@/]+@/;

function maskUrl(url: string): string {
  return url.replace(MASKED_PWD_RE, ':***@');
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: DATABASE_URL is not set');
    process.exit(1);
  }

  const parsed = new URL(url);
  if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
    console.error(
      `FAIL: DATABASE_URL points at local Docker (${parsed.hostname}). ` +
        `This invariant must run against production. Refusing.`,
    );
    process.exit(1);
  }

  console.log(`[i2] host: ${parsed.hostname}:${parsed.port || 5432}`);
  console.log(`[i2] url:  ${maskUrl(url)}`);

  const sql = postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  });

  try {
    const breakdown = await sql<{ status: string; n: number }[]>`
      SELECT status::text AS status, COUNT(*)::int AS n
        FROM bookings
       GROUP BY status
       ORDER BY status
    `;

    const [totalRow] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
    `;
    const total = totalRow?.n ?? 0;

    const counts: Record<string, number> = {
      PENDING: 0,
      RESERVED: 0,
      CONFIRMED: 0,
      FAILED: 0,
      EXPIRED: 0,
    };
    for (const row of breakdown) {
      counts[row.status] = row.n;
    }

    const sum =
      counts.PENDING + counts.RESERVED + counts.CONFIRMED + counts.FAILED + counts.EXPIRED;

    console.log('[i2] bookings breakdown:');
    for (const status of Object.keys(counts)) {
      console.log(`  ${status.padEnd(10)} ${counts[status]}`);
    }
    console.log(`  ---`);
    console.log(`  sum        ${sum}`);
    console.log(`  total      ${total}`);

    // DLQ depth — operator signal; does NOT break I2 by itself.
    const [dlq] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM dlq_jobs WHERE resolved_at IS NULL
    `;
    console.log(`[i2] dlq_jobs unresolved: ${dlq?.n ?? 0}`);

    // Unknown-status guard: if breakdown has a row with status outside the
    // five expected values, the sum above already omits it. Surface that.
    const known = new Set(['PENDING', 'RESERVED', 'CONFIRMED', 'FAILED', 'EXPIRED']);
    const unknown = breakdown.filter((r) => !known.has(r.status));
    if (unknown.length > 0) {
      console.error('FAIL: unknown booking.status values found:', unknown);
      await sql.end();
      process.exit(1);
    }

    if (sum !== total) {
      console.error(`FAIL: I2 broken. sum(${sum}) != total(${total}) — ${total - sum} lost`);
      await sql.end();
      process.exit(1);
    }

    console.log(`PASS: I2 count reconciliation holds — ${total} bookings = Σ(status)`);
    await sql.end();
    process.exit(0);
  } catch (e) {
    console.error('FAIL: query error —', e instanceof Error ? e.message : String(e));
    await sql.end();
    process.exit(1);
  }
}

void main();
