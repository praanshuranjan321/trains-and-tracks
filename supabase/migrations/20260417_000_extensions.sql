-- Extensions required by the schema.
-- pgcrypto for gen_random_uuid() used by bookings.id / payments.id / dlq_jobs.id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
