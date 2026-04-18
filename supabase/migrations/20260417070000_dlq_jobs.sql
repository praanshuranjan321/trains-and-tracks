-- DLQ jobs — operator mirror of QStash DLQ (via failureCallback webhook).
-- QStash's /v2/dlq is the source of truth; this table caches entries so the
-- /ops/dlq page doesn't hit Upstash API per list refresh.

CREATE TABLE IF NOT EXISTS dlq_jobs (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  qstash_message_id TEXT         NOT NULL UNIQUE,
  payload           JSONB        NOT NULL,
  error_reason      TEXT         NOT NULL,
  attempt_count     INTEGER      NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  retried_at        TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dlq_jobs_unresolved_idx ON dlq_jobs (created_at DESC)
  WHERE resolved_at IS NULL;
