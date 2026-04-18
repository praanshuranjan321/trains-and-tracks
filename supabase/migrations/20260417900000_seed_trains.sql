-- Seed: Rajdhani 12951 New Delhi → Mumbai, Tatkal opens "tomorrow 10:00".

INSERT INTO trains (id, name, source, destination, departure_time,
                    tatkal_opens_at, total_seats, base_price_paise)
VALUES (
  '12951',
  'Mumbai Rajdhani Express',
  'New Delhi',
  'Mumbai Central',
  '16:35:00',
  (date_trunc('day', now() + interval '1 day') + time '10:00:00'),
  500,
  126000
) ON CONFLICT (id) DO NOTHING;
