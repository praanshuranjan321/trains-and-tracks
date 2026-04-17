import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const rows = await sql`select 1 as ok`;
    console.log(JSON.stringify(rows));
    await sql.end();
  } catch (e: any) {
    console.error('FAIL:', e.code || '', e.message || e);
    process.exit(2);
  }
}

main();
