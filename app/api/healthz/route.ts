// Health probe.
// Per API_CONTRACT §8.1 this will eventually probe Redis, Postgres (via Cockatiel)
// and QStash. For Phase 0 it's a routing-level heartbeat — enough to prove the
// Vercel deployment is live. Dependency checks land in Phase 3 once lib/db,
// lib/redis, and the resilience policies exist.

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const VERSION = '0.1.0-phase-0';

export async function GET() {
  return Response.json({
    status: 'healthy',
    version: VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      redis: 'not-wired',
      postgres: 'not-wired',
      qstash: 'not-wired',
    },
  });
}
