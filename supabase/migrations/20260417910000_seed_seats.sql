-- Seed: 20 coaches (C01–C20) × 25 seats (01–25) = 500 seats.
-- IDs look like "T12951-C03-14" for coach 3, seat 14.

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
FROM generate_series(0, 499) AS seat_num
ON CONFLICT (id) DO NOTHING;
