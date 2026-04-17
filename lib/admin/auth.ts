// Admin auth for /api/admin/* + /api/simulate.
//   - Primary gate: Authorization: Bearer <ADMIN_SECRET>, compared with
//     crypto.timingSafeEqual to avoid leaking the secret via timing.
//   - Secondary gate: 100%-accurate sliding-window-LOG rate limit (30/min
//     per admin token short-fingerprint). This is Rule 4.1 demonstration:
//     the hot path uses a vendor counter, admin uses a hand-rolled log.

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { luaSlidingWindowLog } from '@/lib/admission/lua-sliding-log';

export interface AdminAuthResult {
  ok: boolean;
  /** Short token fingerprint — safe to log / use as rate-limit identifier. */
  tokenFingerprint?: string;
  /** Set when ok=false; mirrors API_CONTRACT §3 codes. */
  errorCode?: 'admin_unauthorized' | 'rate_limit_exceeded';
  /** Populated when rate_limit_exceeded — seconds until the next slot frees. */
  retryAfterSeconds?: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

/** Constant-time compare. Lengths must match; if not, compare against a dummy. */
function safeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still do a compare to keep timing uniform even on length mismatch.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function fingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

/**
 * Enforces Authorization: Bearer <ADMIN_SECRET> + 30/min/token rate limit.
 * Returns `{ok:true, tokenFingerprint}` on success, `{ok:false, errorCode, ...}`
 * otherwise. Caller maps errorCode → HTTP status (401 vs 429).
 */
export async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get('authorization');
  if (!header) return { ok: false, errorCode: 'admin_unauthorized' };

  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return { ok: false, errorCode: 'admin_unauthorized' };

  const token = match[1]!.trim();
  const expected = required('ADMIN_SECRET');
  if (!safeEq(token, expected)) {
    return { ok: false, errorCode: 'admin_unauthorized' };
  }

  const tokenFingerprint = fingerprint(token);

  // 30 requests / 60s per admin token. 100% accurate via custom Lua.
  const rl = await luaSlidingWindowLog({
    key: `rl:admin:${tokenFingerprint}`,
    limit: 30,
    windowSeconds: 60,
  });

  if (!rl.success) {
    return {
      ok: false,
      errorCode: 'rate_limit_exceeded',
      retryAfterSeconds: rl.retryAfterSeconds,
      tokenFingerprint,
    };
  }

  return { ok: true, tokenFingerprint };
}
