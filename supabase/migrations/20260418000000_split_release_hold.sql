-- Split release_hold into terminal vs retryable paths (ADR-010 follow-up
-- to the O4 retry-short-circuit bug).
--
-- The original release_hold (migration 120) unconditionally set booking.status
-- = 'FAILED' before QStash's retry had a chance. On re-delivery, the worker's
-- `if booking.status != 'PENDING' return` guard short-circuited as 'already
-- terminal', so the retry was silently wasted. Observed symptom: a 100-req
-- surge with PAYMENT_FAILURE_RATE=0.3 produced 55 CONFIRMED instead of the
-- ~97-99 predicted by 3-retry convergence; 22 FAILED + 25 EXPIRED despite
-- 5-min hold TTLs that should have been impossible to trigger in a 10-sec
-- test window. See DECISIONS.md running-log 2026-04-18 for the full trace.
--
-- Fix: two entry points so callers can choose the right semantics.
--
-- The original release_hold(UUID, TEXT) remains in place for backward compat
-- but is DEPRECATED — it is not called from any path after this commit.

-- Retryable release: clears the seat hold ONLY. Booking stays PENDING so
-- the next QStash delivery can reprocess with the current idempotency key.
-- Returns the number of seat rows released (0 or 1 in normal use).
CREATE OR REPLACE FUNCTION release_hold_retryable(p_booking_id UUID)
RETURNS INTEGER AS $$
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
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql;

-- Terminal release: clears the seat hold AND marks booking FAILED. Use only
-- for permanent failures: payment_declined (Stripe-style no-retry outcome),
-- retries-exhausted at the DLQ boundary, sold_out (no seat ever existed).
-- Idempotent: both UPDATEs guard on current status, so re-calling this is
-- safe — matches the "effectively-once" invariant on the cleanup path.
CREATE OR REPLACE FUNCTION release_hold_terminal(
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

COMMENT ON FUNCTION release_hold(UUID, TEXT) IS
  'DEPRECATED — use release_hold_retryable (seat only) or release_hold_terminal (seat + booking=FAILED). The old single-path release marked booking FAILED prematurely, short-circuiting QStash retries. See migration 20260418000000 + DECISIONS.md running-log 2026-04-18.';

COMMENT ON FUNCTION release_hold_retryable(UUID) IS
  'Clears a RESERVED seat hold. Booking stays PENDING so QStash re-delivery can reprocess. Call from the transient error branch of the worker.';

COMMENT ON FUNCTION release_hold_terminal(UUID, TEXT) IS
  'Clears a RESERVED seat hold AND marks the booking FAILED. Idempotent. Call from permanent error branches: payment_declined, retries_exhausted, sold_out.';
