// Edge-compatible Supabase client. PostgREST over HTTPS — works in Edge runtime
// (no TCP). Used by /api/book/[jobId] poll (Edge) and /api/healthz (Edge).
// Node-runtime handlers that need speed should import `sql` from ./pg instead.

import { createClient } from '@supabase/supabase-js';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

export const supabaseAdmin = createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'trains-and-tracks/phase-3' } },
  },
);
