-- Seed: Rajdhani 12951 New Delhi → Mumbai, Tatkal opens "tomorrow 10:00".
-- total_seats dropped 500 → 100 for the demo — small enough that a
-- 200-req burst cleanly shows the sold_out path (≈100 CONFIRMED + ≈100
-- honest rejections), without chewing through the QStash free-tier
-- 1000 msg/day budget. Correctness invariants (I1 zero-duplicate, I2
-- count-reconciliation) hold at any inventory size.
INSERT INTO trains (id, name, source, destination, departure_time,
                    tatkal_opens_at, total_seats, base_price_paise)
VALUES (
  '12951',
  'Mumbai Rajdhani Express',
  'New Delhi',
  'Mumbai Central',
  '16:35:00',
  (date_trunc('day', now() + interval '1 day') + time '10:00:00'),
  100,
  126000
) ON CONFLICT (id) DO UPDATE SET total_seats = EXCLUDED.total_seats;
