-- confirm_booking — commit on payment success.
-- Returns 0 rows if the hold expired mid-payment (race with sweeper);
-- caller must refund the payment.

CREATE OR REPLACE FUNCTION confirm_booking(
  p_booking_id    UUID,
  p_seat_id       TEXT,
  p_payment_id    UUID
) RETURNS TABLE(booking_id UUID) AS $$
#variable_conflict use_column
BEGIN
  UPDATE seats
     SET status = 'CONFIRMED',
         held_until = NULL,
         held_by = NULL,
         version = seats.version + 1,
         updated_at = now()
   WHERE seats.id = p_seat_id
     AND seats.booking_id = p_booking_id
     AND seats.status = 'RESERVED'
     AND seats.held_until > now();

  IF NOT FOUND THEN
    RETURN;  -- hold expired or stolen; caller must refund
  END IF;

  RETURN QUERY
  UPDATE bookings
     SET status = 'CONFIRMED',
         payment_id = p_payment_id,
         confirmed_at = now(),
         updated_at = now()
   WHERE bookings.id = p_booking_id
  RETURNING bookings.id;
END;
$$ LANGUAGE plpgsql;
