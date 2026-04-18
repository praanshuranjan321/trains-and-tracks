-- Payments — mock gateway with same-key idempotency as bookings.
-- UNIQUE(idempotency_key) is the double-charge backstop: attempt-N retries
-- returning the existing row yield zero duplicate charges.

CREATE TABLE IF NOT EXISTS payments (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT            NOT NULL UNIQUE,
  amount_paise     INTEGER         NOT NULL CHECK (amount_paise > 0),
  status           payment_status  NOT NULL,
  error_code       TEXT,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT now()
);
