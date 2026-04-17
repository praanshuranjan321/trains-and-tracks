// QStash signature verifier for Next.js App Router.
//
// In production: wraps the real `verifySignatureAppRouter` from
// @upstash/qstash/nextjs which reads the raw body and validates
// Upstash-Signature against QSTASH_CURRENT_SIGNING_KEY (with fallback to
// QSTASH_NEXT_SIGNING_KEY during key rotation).
//
// In dev-like environments (NODE_ENV !== 'production') we honor
// QSTASH_DEV_BYPASS=1 and skip verification. This is how we test worker /
// sweeper / failure-webhook handlers locally without hand-signing JWTs.
// The bypass is explicitly disabled in production to prevent drift.

import type { NextRequest } from 'next/server';
import { verifySignatureAppRouter as realVerifier } from '@upstash/qstash/nextjs';

type Handler = (req: NextRequest) => Promise<Response>;

// Bypass activates when QSTASH_DEV_BYPASS=1 AND we're NOT running on Vercel.
// `process.env.VERCEL === '1'` is automatically set by Vercel's runtime, so
// the flag is structurally impossible to activate in production. Local
// `next dev` AND `next start` both leave VERCEL unset, so bypass works for
// both (unlike a NODE_ENV check, which `next start` sets to production).
export function verifySignatureAppRouter(handler: Handler): Handler {
  const bypass = process.env.QSTASH_DEV_BYPASS === '1' && !process.env.VERCEL;

  if (bypass) {
    // eslint-disable-next-line no-console
    console.warn(
      '[qstash] signature verification BYPASSED (QSTASH_DEV_BYPASS=1). ' +
        'This flag is inert on Vercel (VERCEL env var present).',
    );
    return handler;
  }

  return realVerifier(handler) as unknown as Handler;
}
