'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client-side so we at least see it in browser devtools + Vercel.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex max-w-lg flex-col items-start gap-6 px-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-destructive">
          error 500 · something broke
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">Unexpected failure</h1>
        <p className="text-sm text-muted-foreground">
          The page threw during rendering. This isn&apos;t a booking failure — it&apos;s a bug
          in the UI. The underlying reservation system is unaffected.
        </p>
        {error.digest && (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[11px] text-muted-foreground">
            digest: {error.digest}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="rounded-md border border-[#00D084] bg-[#00D084]/10 px-4 py-2 font-mono text-[12px] uppercase tracking-widest text-[#00D084] hover:bg-[#00D084]/20"
          >
            try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-4 py-2 font-mono text-[12px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            home
          </Link>
        </div>
      </div>
    </div>
  );
}
