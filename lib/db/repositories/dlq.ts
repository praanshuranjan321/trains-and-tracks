// Repository for dlq_jobs (operator mirror of QStash's own DLQ).
// Source of truth remains QStash's /v2/dlq API; this table is the fast
// cache so /ops/dlq page doesn't hit Upstash on every refresh.

import { sql } from '../pg';

export interface DlqJobRow {
  id: string;
  qstash_message_id: string;
  payload: unknown;
  error_reason: string;
  attempt_count: number;
  created_at: string;
  retried_at: string | null;
  resolved_at: string | null;
}

export async function insertDlqJob(args: {
  qstashMessageId: string;
  payload: unknown;
  errorReason: string;
  attemptCount: number;
}): Promise<{ id: string } | null> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO dlq_jobs (qstash_message_id, payload, error_reason, attempt_count)
    VALUES (
      ${args.qstashMessageId},
      ${JSON.stringify(args.payload)}::jsonb,
      ${args.errorReason},
      ${args.attemptCount}::int
    )
    ON CONFLICT (qstash_message_id) DO NOTHING
    RETURNING id::text
  `;
  return rows[0] ?? null;
}

export async function listUnresolvedDlq(
  limit = 50,
): Promise<DlqJobRow[]> {
  const rows = await sql<DlqJobRow[]>`
    SELECT id::text, qstash_message_id, payload, error_reason, attempt_count,
           created_at, retried_at, resolved_at
      FROM dlq_jobs
     WHERE resolved_at IS NULL
     ORDER BY created_at DESC
     LIMIT ${limit}::int
  `;
  // JSONB returned as text under prepare:false — parse back.
  for (const r of rows) {
    if (typeof r.payload === 'string') {
      try {
        r.payload = JSON.parse(r.payload);
      } catch {
        /* leave as-is */
      }
    }
  }
  return rows;
}

export async function getDlqJobById(id: string): Promise<DlqJobRow | null> {
  const rows = await sql<DlqJobRow[]>`
    SELECT id::text, qstash_message_id, payload, error_reason, attempt_count,
           created_at, retried_at, resolved_at
      FROM dlq_jobs
     WHERE id = ${id}::uuid
  `;
  const r = rows[0];
  if (r && typeof r.payload === 'string') {
    try { r.payload = JSON.parse(r.payload); } catch { /* leave */ }
  }
  return r ?? null;
}

export async function markDlqRetried(id: string): Promise<void> {
  await sql`
    UPDATE dlq_jobs SET retried_at = now() WHERE id = ${id}::uuid
  `;
}

export async function markDlqResolved(id: string): Promise<void> {
  await sql`
    UPDATE dlq_jobs SET resolved_at = now() WHERE id = ${id}::uuid
  `;
}
