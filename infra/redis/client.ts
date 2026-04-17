// Thin adapter over @upstash/redis REST client. Edge-compatible (HTTPS).
// All key schemes, Lua scripts, and rate-limit logic live in lib/ — this file
// is just the authenticated client instance.

import { Redis } from '@upstash/redis';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

export const redis = new Redis({
  url: required('UPSTASH_REDIS_REST_URL'),
  token: required('UPSTASH_REDIS_REST_TOKEN'),
});
