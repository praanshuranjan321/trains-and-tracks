-- Idempotency keys — Stripe-contract store.
-- request_hash: SHA-256 of canonical JSON body (hash mismatch on replay → 400).
-- response_status + response_body: cached from first successful run.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key   TEXT        PRIMARY KEY,
  user_id           TEXT        NOT NULL,
  request_hash      TEXT        NOT NULL,
  response_status   INTEGER,
  response_body     JSONB,
  recovery_point    TEXT        NOT NULL DEFAULT 'started',
  locked_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
CREATE INDEX IF NOT EXISTS idempotency_keys_user_id_idx ON idempotency_keys (user_id);
