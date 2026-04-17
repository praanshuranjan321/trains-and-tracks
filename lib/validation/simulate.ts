import { z } from 'zod';
import { TrainIdSchema } from './common';

export const SimulateRequestSchema = z.object({
  trainId: TrainIdSchema,
  requestCount: z.number().int().positive().max(100_000),
  windowSeconds: z.number().int().positive().max(60),
});

export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
