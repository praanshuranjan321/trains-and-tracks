-- release_hold — explicit rollback on payment failure.
-- Clears any RESERVED seat belonging to the booking and marks the booking FAILED.
-- Returns the number of seats released (0 or 1 in normal use).

CREATE OR REPLACE FUNCTION release_hold(
  p_booking_id UUID,
  p_reason     TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  WITH released AS (
    UPDATE seats
       SET status = 'AVAILABLE',
           booking_id = NULL,
           held_by = NULL,
           held_until = NULL,
           version = seats.version + 1,
           updated_at = now()
     WHERE seats.booking_id = p_booking_id
       AND seats.status = 'RESERVED'
    RETURNING seats.id
  )
  SELECT COUNT(*) INTO v_rows FROM released;

  UPDATE bookings
     SET status = 'FAILED',
         failure_reason = p_reason,
         updated_at = now()
   WHERE bookings.id = p_booking_id
     AND bookings.status = 'PENDING';

  RETURN v_rows;
END;
$$ LANGUAGE plpgsql;
