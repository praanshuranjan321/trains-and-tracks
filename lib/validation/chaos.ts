import { z } from 'zod';

export const KillWorkerSchema = z.object({
  failNextN: z.number().int().positive().max(100),
  failureMode: z.enum(['timeout', '500', 'crash']),
});

export type KillWorker = z.infer<typeof KillWorkerSchema>;
