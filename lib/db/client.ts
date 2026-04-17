// Two DB clients:
// - `sql`          : postgres-js over TCP via Supavisor TX pooler (port 6543)
//                    Used from Node-runtime routes (/api/book, /api/worker/*)
// - `supabaseAdmin`: PostgREST over HTTPS with service_role key
//                    Used from Edge-runtime routes (/api/book/[jobId], /api/healthz)
//
// TX pooler requires { prepare: false } — named prepared statements aren't
// supported at port 6543. max:1 matches `connection_limit=1` in the URL so a
// single invocation never pools two leases.

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing — check .env.local / Vercel env`);
  return v;
}

export const sql = postgres(required('DATABASE_URL'), {
  prepare: false,
  max: 1,
  connect_timeout: 5,
  idle_timeout: 20,
});

export const supabaseAdmin = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'trains-and-tracks/phase-1' } },
  },
);
