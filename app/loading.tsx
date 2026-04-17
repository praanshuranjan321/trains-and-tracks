export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="relative inline-flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00D084] opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-[#00D084]" />
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          loading…
        </div>
      </div>
    </div>
  );
}
