-- Bookings — user intent record. One row per idempotency_key.
-- idempotency_key UNIQUE is the 3rd-layer backstop: even if Redis NX and the
-- idempotency_keys table both bypass, this constraint still rejects duplicates.

CREATE TABLE IF NOT EXISTS bookings (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT           NOT NULL UNIQUE,
  train_id         TEXT           NOT NULL REFERENCES trains(id),
  seat_id          TEXT           REFERENCES seats(id),     -- NULL until allocated
  passenger_name   TEXT           NOT NULL CHECK (length(passenger_name) BETWEEN 1 AND 100),
  passenger_phone  TEXT           CHECK (passenger_phone IS NULL OR length(passenger_phone) BETWEEN 10 AND 15),
  price_paise      INTEGER        NOT NULL,
  status           booking_status NOT NULL DEFAULT 'PENDING',
  failure_reason   TEXT,
  payment_id       UUID           REFERENCES payments(id),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  confirmed_at     TIMESTAMPTZ
);

-- Partial index: only hot states (pending/failed). CONFIRMED bookings are rarely queried by status.
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status)
  WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings (created_at DESC);
