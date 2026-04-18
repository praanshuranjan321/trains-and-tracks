// Health probe — now with real dependency checks per API_CONTRACT §8.1.
// Edge runtime: no TCP, so all three checks go over HTTPS.
//   - Redis PING          via Upstash REST  (500ms timeout)
//   - Supabase REST ping  via PostgREST     (1s  timeout)
//   - QStash reachability via /v2/queues    (1s  timeout)
//
// Overall: 200 if all OK; 200 with status=degraded if any fail (still usable);
// 503 only if every dependency is unreachable.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const VERSION = '1.0.0';

type CheckResult = 'ok' | 'degraded' | 'fail';
interface Checks {
  redis: CheckResult;
  postgres: CheckResult;
  qstash: CheckResult;
}

async function probeRedis(signal: AbortSignal): Promise<CheckResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return 'fail';
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) return 'fail';
    const body = (await res.json()) as { result?: string };
    return body.result === 'PONG' ? 'ok' : 'degraded';
  } catch {
    return 'fail';
  }
}

async function probePostgrest(signal: AbortSignal): Promise<CheckResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 'fail';
  try {
    // Head-like query: first 1 row from trains. Cheap; uses the partial index.
    const res = await fetch(`${url}/rest/v1/trains?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=none',
      },
      signal,
    });
    return res.ok ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}

async function probeQstash(signal: AbortSignal): Promise<CheckResult> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return 'fail';
  try {
    const res = await fetch('https://qstash.upstash.io/v2/queues', {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    return res.ok ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}

function requestIdFrom(req: NextRequest): string {
  const given = req.headers.get('x-request-id');
  if (given && given.length <= 128) return given;
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(req);
  const redisCtl = AbortSignal.timeout(500);
  const pgCtl = AbortSignal.timeout(1000);
  const qsCtl = AbortSignal.timeout(1000);

  const [redis, postgres, qstash] = await Promise.all([
    probeRedis(redisCtl),
    probePostgrest(pgCtl),
    probeQstash(qsCtl),
  ]);

  const checks: Checks = { redis, postgres, qstash };
  const failed = Object.values(checks).filter((v) => v === 'fail').length;

  const status =
    failed === 0
      ? 'healthy'
      : failed < 3
        ? 'degraded'
        : 'unhealthy';

  return NextResponse.json(
    {
      status,
      version: VERSION,
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: status === 'unhealthy' ? 503 : 200,
      headers: {
        'X-Request-ID': requestId,
        'Cache-Control': 'no-store',
      },
    },
  );
}
