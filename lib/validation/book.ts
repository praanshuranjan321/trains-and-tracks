import { z } from 'zod';
import { TrainIdSchema } from './common';

export const BookRequestSchema = z.object({
  trainId: TrainIdSchema,
  passengerName: z.string().min(1).max(100).trim(),
  passengerPhone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'phone must be 10–15 digits, optional leading +')
    .optional(),
});

export type BookRequest = z.infer<typeof BookRequestSchema>;
