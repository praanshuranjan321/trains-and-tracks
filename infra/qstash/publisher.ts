// Thin adapter over @upstash/qstash. The Rule 4.1 discipline says this stays
// narrow — everything interesting (Flow Control key design, retry policy
// choices, DLQ drain) lives in lib/. This file is the vendor surface only.

import { Client } from '@upstash/qstash';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} missing`);
  return v;
}

export const qstash = new Client({
  token: required('QSTASH_TOKEN'),
  baseUrl: process.env.QSTASH_URL,
});

export interface AllocateJobPayload {
  bookingId: string;
  idempotencyKey: string;
  trainId: string;
  passengerName: string;
}

/**
 * Publishes a seat-allocate job. Flow Control `key: train:<id>, parallelism: 1`
 * per ADR-004 serializes workers for the same train at the broker — no
 * app-level advisory lock needed. `rate: 200, period: "1s"` throttles per-train
 * allocation to 200/s so workers can't outrun Postgres.
 */
export async function publishAllocateJob(args: AllocateJobPayload): Promise<{ messageId: string }> {
  const appUrl = required('APP_URL');
  const res = await qstash.publishJSON({
    url: `${appUrl}/api/worker/allocate`,
    body: args,
    flowControl: {
      // NOTE: QStash's flowControlKey validator accepts only
      // [A-Za-z0-9._-] — the ':' separator in ADR-004 is rejected.
      // Semantics unchanged; `train.` namespaces the same way.
      key: `train.${args.trainId}`,
      parallelism: 1,
      rate: 200,
      period: '1s',
    },
    retries: 3,
    failureCallback: `${appUrl}/api/webhooks/qstash-failure`,
  });
  return { messageId: res.messageId };
}
