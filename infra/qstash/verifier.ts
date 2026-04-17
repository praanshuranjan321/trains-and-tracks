// Thin re-export of @upstash/qstash's Next.js App Router signature wrapper.
// Critical constraint (dossier §4): the wrapper reads the RAW body to verify
// the Upstash-Signature JWT — handlers must not parse+restringify before it.
// Signing keys rotate via QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY.

export { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
