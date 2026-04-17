import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

// Supavisor TX pooler: no prepared statements, one connection per invocation.
const sql = postgres(DB_URL, { prepare: false, max: 1, connect_timeout: 15 });

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Applying ${files.length} migrations from ${MIGRATIONS_DIR}\n`);

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const text = readFileSync(path, 'utf8');
    const t0 = Date.now();
    try {
      // postgres-js supports multi-statement via .unsafe() with a string.
      await sql.unsafe(text);
      const ms = Date.now() - t0;
      console.log(`PASS  ${file}  (${ms}ms)`);
    } catch (e: any) {
      console.error(`FAIL  ${file}`);
      console.error(`  ${e.code ?? ''} ${e.message ?? e}`);
      if (e.position) console.error(`  position: ${e.position}`);
      process.exit(2);
    }
  }

  // Post-migration sanity check per DEV_BRIEF §9 Phase 1 gate.
  const [seatCount] = await sql`
    SELECT COUNT(*)::int AS n, status::text
      FROM seats
     WHERE train_id = '12951'
     GROUP BY status
  `;
  console.log(`\nSeat seed check: ${seatCount?.n ?? 0} ${seatCount?.status ?? '?'}`);

  const [trainCount] = await sql`SELECT COUNT(*)::int AS n FROM trains`;
  console.log(`Train seed check: ${trainCount.n} train(s)`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
