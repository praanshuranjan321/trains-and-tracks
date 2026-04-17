-- sweep_expired_holds — scheduled reclaim of abandoned holds.
-- Called by /api/sweeper/expire-holds (QStash Schedule every 60s).
-- pg_try_advisory_xact_lock(8675309) guard: concurrent sweepers skip silently,
-- the lock releases at txn end (required on Supavisor TX pooler).

CREATE OR REPLACE FUNCTION sweep_expired_holds()
RETURNS TABLE(swept_count INTEGER, skipped BOOLEAN) AS $$
DECLARE
  v_acquired BOOLEAN;
  v_count    INTEGER;
BEGIN
  SELECT pg_try_advisory_xact_lock(8675309) INTO v_acquired;

  IF NOT v_acquired THEN
    swept_count := 0;
    skipped := TRUE;
    RETURN NEXT;
    RETURN;
  END IF;

  WITH expired AS (
    UPDATE seats
       SET status = 'AVAILABLE',
           booking_id = NULL,
           held_by = NULL,
           held_until = NULL,
           version = seats.version + 1,
           updated_at = now()
     WHERE seats.status = 'RESERVED'
       AND seats.held_until < now()
    RETURNING seats.booking_id AS booking_id
  ),
  expired_bookings AS (
    UPDATE bookings
       SET status = 'EXPIRED',
           failure_reason = 'hold_expired',
           updated_at = now()
     WHERE bookings.id IN (SELECT booking_id FROM expired WHERE booking_id IS NOT NULL)
       AND bookings.status = 'PENDING'
    RETURNING bookings.id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  swept_count := v_count;
  skipped := FALSE;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
