// Deterministic content hash for Stripe-contract idempotency.
// Same key + same body → replay cached response (source='existing' + hash match).
// Same key + different body → HTTP 400 idempotency_key_in_use (hash mismatch).
//
// Canonicalization rules:
//  - Object keys sorted lexicographically (so {a:1,b:2} and {b:2,a:1} hash the same)
//  - Arrays preserve order (semantic)
//  - null/undefined primitives pass through as-is from JSON.stringify
//  - Strings, numbers, booleans are their JSON representation
// Then SHA-256 → hex. Node runtime uses node:crypto; any future Edge runtime
// call site should swap to crypto.subtle.

import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = canonicalize(v);
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function computeRequestHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
