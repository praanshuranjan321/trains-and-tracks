import { z } from 'zod';
import { IdempotencyKeySchema, TrainIdSchema } from './common';

// QStash-delivered payload to /api/worker/allocate. Phase 3 consumer.
export const AllocateJobSchema = z.object({
  bookingId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  trainId: TrainIdSchema,
  passengerName: z.string().min(1).max(100),
});

export type AllocateJob = z.infer<typeof AllocateJobSchema>;
