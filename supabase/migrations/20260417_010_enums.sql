-- Three enums encoding the state machines. The seats CHECK constraint in
-- migration 030 relies on seat_status values being exactly these three.

DO $$ BEGIN
  CREATE TYPE seat_status AS ENUM (
    'AVAILABLE',
    'RESERVED',
    'CONFIRMED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'PENDING',
    'CONFIRMED',
    'FAILED',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'succeeded',
    'failed',
    'pending'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
