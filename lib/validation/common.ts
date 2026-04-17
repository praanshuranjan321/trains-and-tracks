import { z } from 'zod';

// UUIDv4 for idempotency keys (Stripe contract).
export const IdempotencyKeySchema = z.string().uuid();

export const TrainIdSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Z0-9]+$/, 'trainId must be uppercase alphanumeric');
