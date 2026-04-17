-- Trains — static reference. One row for the hackathon (12951 Rajdhani).

CREATE TABLE IF NOT EXISTS trains (
  id                TEXT        PRIMARY KEY,
  name              TEXT        NOT NULL,
  source            TEXT        NOT NULL,
  destination       TEXT        NOT NULL,
  departure_time    TIME        NOT NULL,
  tatkal_opens_at   TIMESTAMPTZ NOT NULL,
  total_seats       INTEGER     NOT NULL CHECK (total_seats > 0),
  base_price_paise  INTEGER     NOT NULL CHECK (base_price_paise > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
