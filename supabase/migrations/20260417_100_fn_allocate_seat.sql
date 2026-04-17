-- allocate_seat — the SKIP LOCKED core.
-- Returns 1 row on success, 0 rows if no seats available.
-- Caller inspects row count; 0 rows → respond "sold_out" with status=FAILED.
-- Single-statement UPDATE with subquery lock is Supavisor-TX-compatible:
-- no advisory lock needed, linear scaling across workers, convoy-free.

CREATE OR REPLACE FUNCTION allocate_seat(
  p_train_id      TEXT,
  p_booking_id    UUID,
  p_passenger     TEXT,
  p_hold_duration INTERVAL DEFAULT '5 minutes'
) RETURNS TABLE(seat_id TEXT, version INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE seats
     SET status = 'RESERVED',
         booking_id = p_booking_id,
         held_by = p_passenger,
         held_until = now() + p_hold_duration,
         version = seats.version + 1,
         updated_at = now()
   WHERE seats.id = (
     SELECT s.id
       FROM seats s
      WHERE s.train_id = p_train_id
        AND s.status = 'AVAILABLE'
      ORDER BY s.id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING seats.id, seats.version;
END;
$$ LANGUAGE plpgsql;
