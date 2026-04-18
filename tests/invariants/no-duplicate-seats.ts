// I1 — zero-duplicate seat allocation invariant.
//
// Runs the canonical correctness query from DATA_MODEL §10:
//
//   SELECT seat_id, COUNT(*) AS n FROM bookings
//    WHERE status = 'CONFIRMED'
//    GROUP BY seat_id
//   HAVING COUNT(*) > 1;
//
// Expected result: 0 rows. Any row is a broken invariant — the same seat was
// successfully confirmed for two or more bookings. That violates PRD §5.2
// guarantee #1 and FAILURE_MATRIX §1 invariant I1.
//
// Usage (from repo root):
//
//   DATABASE_URL=$(grep ^DATABASE_URL .env.production | cut -d= -f2- | tr -d '"') \
//     pnpm test:invariant:i1
//
// Exit codes: 0 = invariant holds; 1 = violation found or env refused.
//
// Safety gate: refuses to run against a local Docker Supabase URL
// (127.0.0.1:54322) — the whole point is to verify the *deployed* claim.

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

  console.log(`[i1] host: ${parsed.hostname}:${parsed.port || 5432}`);
  console.log(`[i1] url:  ${maskUrl(url)}`);

  const sql = postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  });

  try {
    const rows = await sql<{ seat_id: string | null; n: number }[]>`
      SELECT seat_id, COUNT(*)::int AS n
        FROM bookings
       WHERE status = 'CONFIRMED'
       GROUP BY seat_id
      HAVING COUNT(*) > 1
    `;

    if (rows.length === 0) {
      const [total] = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM bookings WHERE status = 'CONFIRMED'
      `;
      console.log(
        `PASS: I1 zero-duplicate invariant holds — ${total?.n ?? 0} CONFIRMED bookings, 0 shared seat_ids`,
      );
      await sql.end();
      process.exit(0);
    }

    console.error('FAIL: I1 broken. Seats with >1 CONFIRMED booking:');
    for (const row of rows) {
      console.error(`  seat_id=${row.seat_id}  confirmed_count=${row.n}`);
    }
    await sql.end();
    process.exit(1);
  } catch (e) {
    console.error('FAIL: query error —', e instanceof Error ? e.message : String(e));
    await sql.end();
    process.exit(1);
  }
}

void main();
