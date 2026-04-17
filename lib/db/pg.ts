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

// Connection pool sizing:
//   production (Vercel serverless) : max:1 — each invocation = own instance;
//                                    Supavisor (200 pooler slots) handles fan-out
//   local dev / testing            : one Node process serves N concurrent
//                                    requests; max:1 would serialize them all
//                                    through one TCP connection → event-loop
//                                    starvation under any real load
// Override via PG_MAX_CONNECTIONS. Safe upper bound is ~10 for local; Supavisor
// pooler can absorb 200 connections total across all clients.
const PG_MAX = Number(process.env.PG_MAX_CONNECTIONS) ||
  (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 1 : 10);

export const sql = postgres(required('DATABASE_URL'), {
  prepare: false,
  max: PG_MAX,
  connect_timeout: 10,
  idle_timeout: 20,
});
