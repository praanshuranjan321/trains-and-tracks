// Durable idempotency authority in Postgres.
// Wraps the `idempotency_check` stored function (migration 140) which uses
// the CTE+UNION pattern — always returns exactly one row with
// source ∈ {'inserted','existing'}. This avoids the documented footgun where
// `INSERT ... ON CONFLICT DO NOTHING RETURNING *` silently yields zero rows on
// conflict (dossier §3, FAILURE_MATRIX §2.3).
//
// On top of the raw RPC, this module adds the semantic decision tree:
//   - inserted                    → fresh request, caller proceeds
//   - existing + hash mismatch    → 400 idempotency_key_in_use
//   - existing + response cached  → replay cached response
//   - existing + no response yet  → still inflight, 409 idempotency_key_replaying

import {
  idempotencyCheck,
  writeIdempotencyResponse,
  type IdempotencyCheckResult,
} from '@/lib/db/repositories/idempotency';

export type IdempotencyVerdict =
  | { kind: 'fresh' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'inflight' }
  | { kind: 'hash_mismatch' };

export async function checkIdempotency(args: {
  key: string;
  userId: string;
  requestHash: string;
}): Promise<IdempotencyVerdict> {
  const row: IdempotencyCheckResult = await idempotencyCheck(args);

  if (row.source === 'inserted') {
    return { kind: 'fresh' };
  }

  // source === 'existing' — pre-flight reservation was made by someone earlier.
  if (row.request_hash !== args.requestHash) {
    return { kind: 'hash_mismatch' };
  }

  if (row.response_status !== null && row.response_body !== null) {
    return {
      kind: 'replay',
      status: row.response_status,
      body: row.response_body,
    };
  }

  // existing row, matching hash, but no response written yet → worker still
  // processing the original request. Client should poll the booking instead of
  // retrying; we 409 with guidance.
  return { kind: 'inflight' };
}

export async function commitIdempotencyResponse(args: {
  key: string;
  status: number;
  body: unknown;
}): Promise<void> {
  await writeIdempotencyResponse(args);
}
