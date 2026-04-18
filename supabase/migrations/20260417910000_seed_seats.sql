-- Seed: 4 coaches (C01–C04) × 25 seats (01–25) = 100 seats.
-- IDs look like "T12951-C03-14" for coach 3, seat 14.
-- Inventory dropped 500 → 100 so a 200-req demo burst cleanly shows the
-- sold_out path; see seed_trains migration for rationale.

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
FROM generate_series(0, 99) AS seat_num
ON CONFLICT (id) DO NOTHING;
