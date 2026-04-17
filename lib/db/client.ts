// Back-compat barrel. Node-runtime code can import { sql, supabaseAdmin } from
// '@/lib/db/client' unchanged; Edge-runtime routes should import
// { supabaseAdmin } from '@/lib/db/supabase' directly to avoid pulling
// postgres-js into the Edge bundle.

export { sql } from './pg';
export { supabaseAdmin } from './supabase';
