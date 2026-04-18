-- write_idempotency_response — cache the final response for replay.
-- Called by the worker after terminal state is reached.

CREATE OR REPLACE FUNCTION write_idempotency_response(
  p_key    TEXT,
  p_status INTEGER,
  p_body   JSONB
) RETURNS VOID AS $$
BEGIN
  UPDATE idempotency_keys
     SET response_status = p_status,
         response_body   = p_body
   WHERE idempotency_key = p_key;
END;
$$ LANGUAGE plpgsql;
