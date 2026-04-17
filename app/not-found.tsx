import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex max-w-lg flex-col items-start gap-6 px-6">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          404 · not found
        </div>
        <h1
          className="font-bold uppercase leading-[0.9] tracking-tight"
          style={{
            fontSize: 'clamp(3rem, 8vw, 6rem)',
            fontFamily: '"Anton", "Bebas Neue", system-ui, sans-serif',
          }}
        >
          Wrong platform.
        </h1>
        <p className="text-sm text-muted-foreground">
          This page isn&apos;t on the board. The train you&apos;re looking for is probably at{' '}
          <Link href="/book" className="text-[#00D084] underline">
            /book
          </Link>
          , or the ops dashboard at{' '}
          <Link href="/ops" className="text-[#00D084] underline">
            /ops
          </Link>
          .
        </p>
        <Link
          href="/"
          className="rounded-md border border-[#00D084] bg-[#00D084]/10 px-4 py-2 font-mono text-[12px] uppercase tracking-widest text-[#00D084] hover:bg-[#00D084]/20"
        >
          ← home
        </Link>
      </div>
    </div>
  );
}
