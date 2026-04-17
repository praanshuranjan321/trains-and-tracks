// Repository wrappers for the idempotency_keys table.
// The `idempotency_check` stored function is the CTE+UNION pattern that fixes
// the `ON CONFLICT DO NOTHING RETURNING` zero-rows footgun — always returns
// exactly one row with source ∈ {'inserted','existing'}.

import { sql } from '../client';

export interface IdempotencyCheckResult {
  idempotency_key: string;
  request_hash: string;
  response_status: number | null;
  response_body: unknown | null;
  source: 'inserted' | 'existing';
}

export async function idempotencyCheck(args: {
  key: string;
  userId: string;
  requestHash: string;
}): Promise<IdempotencyCheckResult> {
  const rows = await sql<IdempotencyCheckResult[]>`
    SELECT idempotency_key, request_hash, response_status, response_body, source
      FROM idempotency_check(
        ${args.key}::text,
        ${args.userId}::text,
        ${args.requestHash}::text
      )
  `;
  const row = rows[0];
  if (!row) {
    // idempotency_check is designed to always return one row.
    // Reaching here indicates a plpgsql contract violation.
    throw new Error('idempotency_check returned no row');
  }
  // postgres-js with prepare:false (required on Supavisor TX pooler) loses the
  // JSONB type OID metadata and returns jsonb columns as text. Parse back into
  // the structured object we stored.
  if (typeof row.response_body === 'string') {
    try {
      row.response_body = JSON.parse(row.response_body);
    } catch {
      // leave as-is; shouldn't happen given we control the writer
    }
  }
  return row;
}

export async function writeIdempotencyResponse(args: {
  key: string;
  status: number;
  body: unknown;
}): Promise<void> {
  await sql`
    SELECT write_idempotency_response(
      ${args.key}::text,
      ${args.status}::int,
      ${JSON.stringify(args.body)}::jsonb
    )
  `;
}
