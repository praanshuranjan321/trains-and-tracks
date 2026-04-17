import { z } from 'zod';
import { TrainIdSchema } from './common';

export const ResetSchema = z.object({
  confirm: z.literal('reset'),
  trainId: TrainIdSchema,
});

export type ResetArgs = z.infer<typeof ResetSchema>;
