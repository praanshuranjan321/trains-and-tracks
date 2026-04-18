-- Seed: 2 coaches (C01–C02) × 25 seats (01–25) = 50 seats.
-- IDs look like "T12951-C02-14" for coach 2, seat 14.
-- Inventory dropped 500 → 100 → 50 so a 100-req demo burst cleanly shows
-- the sold_out path (≈50 CONFIRMED + ≈50 honest rejections); see the
-- seed_trains migration for rationale.

INSERT INTO seats (id, train_id, coach, seat_number, status, price_paise)
SELECT
  format('T12951-C%s-%s',
    lpad((seat_num / 25 + 1)::text, 2, '0'),
    lpad((seat_num % 25 + 1)::text, 2, '0')
  ) AS id,
  '12951',
  format('C%s', lpad((seat_num / 25 + 1)::text, 2, '0')),
  lpad((seat_num % 25 + 1)::text, 2, '0'),
  'AVAILABLE'::seat_status,
  126000
FROM generate_series(0, 49) AS seat_num
ON CONFLICT (id) DO NOTHING;
