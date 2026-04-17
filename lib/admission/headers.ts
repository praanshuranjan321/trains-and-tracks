// Admission-layer response headers. IETF draft-10 RateLimit format plus
// legacy X-RateLimit-* plus Retry-After plus X-Request-ID, X-Queue-Depth.

import type { RateLimitOutcome } from './rate-limiter';

export function rateLimitHeaders(r: RateLimitOutcome): Record<string, string> {
  return {
    // IETF draft-ietf-httpapi-ratelimit-headers-10 (Sept 2025)
    'RateLimit-Policy': `"sliding";q=${r.limit};w=${r.windowSeconds}`,
    RateLimit: `"sliding";r=${r.remaining};t=${r.resetSeconds}`,
    // Legacy format for client compat
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(r.resetSeconds),
  };
}

export function retryAfterHeader(seconds: number): Record<string, string> {
  return { 'Retry-After': String(Math.max(1, Math.ceil(seconds))) };
}

export function queueDepthHeader(depth: number): Record<string, string> {
  return { 'X-Queue-Depth': String(depth) };
}
