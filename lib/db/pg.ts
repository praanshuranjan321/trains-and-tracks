// Node-runtime postgres-js client (TCP via Supavisor TX pooler port 6543).
// REQUIRED: prepare:false — TX pooler rejects named prepared statements.
// REQUIRED: max:1 — matches connection_limit=1 in the URL so a single
// invocation never holds two leases of the shared pool.
//
// Do NOT import from Edge-runtime routes — postgres-js has Node-only deps
// (net, tls) that break Edge bundling. Use lib/db/supabase.ts there instead.

import postgres from 'postgres';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

export const sql = postgres(required('DATABASE_URL'), {
  prepare: false,
  max: 1,
  connect_timeout: 5,
  idle_timeout: 20,
});
