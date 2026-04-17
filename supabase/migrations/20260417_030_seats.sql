-- Seats — the correctness engine.
-- booking_id is UUID here with NO inline FK; the FK constraint is added
-- in migration 160 because bookings doesn't exist yet (mutual FK).

CREATE TABLE IF NOT EXISTS seats (
  id            TEXT        PRIMARY KEY,
  train_id      TEXT        NOT NULL REFERENCES trains(id),
  coach         TEXT        NOT NULL,
  seat_number   TEXT        NOT NULL,
  status        seat_status NOT NULL DEFAULT 'AVAILABLE',
  booking_id    UUID,  -- FK added in migration 160 (forward ref to bookings)
  held_by       TEXT,
  held_until    TIMESTAMPTZ,
  version       INTEGER     NOT NULL DEFAULT 0,
  price_paise   INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (train_id, coach, seat_number),
  CHECK ((status = 'AVAILABLE' AND booking_id IS NULL AND held_until IS NULL)
      OR (status = 'RESERVED'  AND booking_id IS NOT NULL AND held_until IS NOT NULL)
      OR (status = 'CONFIRMED' AND booking_id IS NOT NULL AND held_until IS NULL))
);

-- Partial index on AVAILABLE rows — the seat-allocation hotspot. Small even
-- under pressure; keeps FOR UPDATE SKIP LOCKED subquery fast.
CREATE INDEX IF NOT EXISTS seats_avail_idx ON seats (train_id, id)
  WHERE status = 'AVAILABLE';

-- Sweeper reads this partial index; never scans confirmed rows.
CREATE INDEX IF NOT EXISTS seats_held_idx ON seats (held_until)
  WHERE status = 'RESERVED';

CREATE INDEX IF NOT EXISTS seats_booking_id_idx ON seats (booking_id)
  WHERE booking_id IS NOT NULL;
