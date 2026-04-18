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

// ---- Local-dev in-process queue (bypass mode only) --------------------------
// Tail-chain per Flow Control key. Each trainId gets its own Promise chain so
// workers for the same train run serially (parallelism: 1), while different
// trains are independent. This mirrors QStash Flow Control.
//
// IMPORTANT: we call runWorkerJob() directly — NOT `fetch(workerUrl)` — because
// same-process HTTP round-trips saturate the single Node event loop under any
// significant ingress volume (observed: /api/book taking 100+s during a 1000
// surge because it competed with inbound worker fetches). Direct function call
// keeps the worker logic off the HTTP path entirely.
const LOCAL_QUEUES = new Map<string, Promise<unknown>>();

function enqueueLocalWorker(args: AllocateJobPayload): void {
  const key = `train.${args.trainId}`;
  const tail = LOCAL_QUEUES.get(key) ?? Promise.resolve();
  const next = tail
    .then(async () => {
      const { runWorkerJob } = await import('@/lib/allocation/run-worker-job');
      return runWorkerJob(args);
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[qstash-bypass] local worker chain:', e);
    });
  LOCAL_QUEUES.set(key, next);
}

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

  // Local-dev bypass: when QSTASH_DEV_BYPASS=1 AND we're NOT on Vercel,
  // dispatch the worker in-process over HTTP instead of publishing to QStash.
  // Keyed off VERCEL (auto-set by Vercel runtime), not NODE_ENV — `next start`
  // sets NODE_ENV=production even when running locally, which would wrongly
  // disable the bypass. On Vercel, VERCEL=1 makes the flag structurally inert.
  const bypass = process.env.QSTASH_DEV_BYPASS === '1' && !process.env.VERCEL;

  if (bypass) {
    // In-process direct dispatch — no HTTP round-trip, no event-loop contention.
    // Per-train Promise chain mirrors QStash Flow Control parallelism:1.
    enqueueLocalWorker(args);
    const messageId = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return { messageId };
  }

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
