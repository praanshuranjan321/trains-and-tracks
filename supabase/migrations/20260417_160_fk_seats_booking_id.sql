-- Resolves the circular FK between seats and bookings.
-- seats.booking_id was declared without its FK in migration 030 (because
-- bookings did not exist yet); this ALTER adds the constraint after both
-- tables exist. Runs cleanly on re-apply thanks to IF NOT EXISTS on the
-- check below being unavailable for constraints — we rely on migration
-- tracking to prevent re-runs.

ALTER TABLE seats
  ADD CONSTRAINT seats_booking_id_fkey
  FOREIGN KEY (booking_id)
  REFERENCES bookings(id)
  ON DELETE SET NULL;
