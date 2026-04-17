-- idempotency_check — CTE+UNION atomic insert-or-return.
-- Fixes the `ON CONFLICT DO NOTHING RETURNING` zero-rows footgun.
-- Always returns exactly one row with source ∈ {'inserted','existing'}.

CREATE OR REPLACE FUNCTION idempotency_check(
  p_key          TEXT,
  p_user_id      TEXT,
  p_request_hash TEXT
) RETURNS TABLE(
  idempotency_key  TEXT,
  request_hash     TEXT,
  response_status  INTEGER,
  response_body    JSONB,
  source           TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH ins AS (
    INSERT INTO idempotency_keys (idempotency_key, user_id, request_hash)
    VALUES (p_key, p_user_id, p_request_hash)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_keys.idempotency_key,
              idempotency_keys.request_hash,
              idempotency_keys.response_status,
              idempotency_keys.response_body,
              'inserted'::TEXT AS source
  )
  SELECT * FROM ins
  UNION ALL
  SELECT ik.idempotency_key,
         ik.request_hash,
         ik.response_status,
         ik.response_body,
         'existing'::TEXT
    FROM idempotency_keys ik
   WHERE ik.idempotency_key = p_key
     AND NOT EXISTS (SELECT 1 FROM ins)
   LIMIT 1;
END;
$$ LANGUAGE plpgsql;
