// Landing — RSC. Pulls the problem narrative from PRD §2.1 and wires two
// CTAs: /book for the happy path, /ops for the judge demo.
//
// Phase 7 polish (2026-04-18 06:00 IST): editorial travel-magazine direction.
// Serif display (Fraunces), flat-illustration plate anchor, teal/ivory/train-red
// palette extracted from /public/hero_image.png. The old Anton + signal-green
// treatment survives on /ops where Grafana-dark is the brief.

import Link from 'next/link';
import Image from 'next/image';
import { ArrowDown, ArrowRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CASE_STUDIES = [
  {
    system: 'IRCTC Tatkal',
    headline: '50%',
    subhead: 'bot-driven login traffic in the first 5 minutes (Ministry of Railways, 2025)',
    pain: 'Payment deducted before seat confirmed — legitimate users lose seats to bots.',
  },
  {
    system: 'BookMyShow · Coldplay',
    headline: '305×',
    subhead: 'demand vs capacity · 13M queued for 150K tickets (Sept 2024)',
    pain: 'Global queue key + weak bot mitigation. Mumbai EOW alleged 9L of 12L queued were bots.',
  },
  {
    system: 'CoWIN',
    headline: '30K/s',
    subhead: 'peak updates · 13.7M registrations in 8h (28 Apr 2021)',
    pain: 'Public 5-min-cached endpoint weaponized by Telegram bots. Humans never saw a slot.',
  },
  {
    system: 'Ticketmaster · Eras',
    headline: '4×',
    subhead: 'previous peak · 3.5B system requests (Nov 2022)',
    pain: 'Verified Fan gated entry, not checkout. Cart holds weren\'t held. Senate hearing followed.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero — editorial departure card. Asymmetric 2-col grid: serif display
          left, flat-illustration plate right. Paper-grain noise, hairline
          rules, mono micro-caps rubrics, tickertape marquee + scroll cue at
          foot. 70vh min-height enforced at section level; min-h clamped on
          mobile where the stack eats more vertical. */}
      <section className="relative isolate overflow-hidden bg-ink text-cloud-ivory">
        {/* Paper-grain noise — keeps the ink field from looking flat-matte. */}
        <svg
          className="pointer-events-none absolute inset-0 -z-0 h-full w-full opacity-[0.045] mix-blend-screen"
          aria-hidden
        >
          <filter id="hero-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#hero-grain)" />
        </svg>

        {/* Top rubric bar — departure-card framing. */}
        <div className="relative z-10 border-b border-cloud-ivory/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 font-mono text-[10px] uppercase tracking-[0.22em] text-cloud-ivory/55 sm:text-[11px]">
            <div className="flex items-center gap-3">
              <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-train-red" />
              <span>
                Trains <span className="text-cloud-ivory/25">&amp;</span> Tracks
              </span>
              <span aria-hidden className="hidden text-cloud-ivory/20 sm:inline">
                /
              </span>
              <span className="hidden sm:inline">№ 01 · Departures</span>
            </div>
            <div className="hidden items-center gap-5 md:flex">
              <span>NDLS → BCT</span>
              <span aria-hidden className="text-cloud-ivory/20">
                ·
              </span>
              <span>Est. April 2026</span>
            </div>
          </div>
        </div>

        {/* Main body — asymmetric grid. */}
        <div className="relative z-10 mx-auto grid min-h-[70vh] max-w-7xl grid-cols-1 gap-12 px-6 pb-20 pt-14 sm:pt-20 lg:grid-cols-12 lg:gap-14 lg:pb-24 lg:pt-20">
          {/* Left: editorial column. Image appears first on mobile, type first on desktop. */}
          <div className="order-2 flex flex-col justify-center lg:order-1 lg:col-span-7">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-train-red sm:text-[11px]">
              <span aria-hidden className="h-px w-8 bg-train-red/70" />
              The Tatkal problem, solved
            </div>

            <h1
              className="mt-6 font-serif font-medium uppercase text-cloud-ivory"
              style={{
                fontSize: 'clamp(3rem, 8vw, 8rem)',
                lineHeight: 0.9,
                letterSpacing: '-0.03em',
                fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
              }}
            >
              Exactly once.
              <span className="block">Every time.</span>
            </h1>

            <div className="mt-10 flex items-start gap-4">
              <span aria-hidden className="mt-3 hidden h-px w-10 shrink-0 bg-cloud-ivory/40 sm:block" />
              <p
                className="max-w-[38ch] font-serif italic text-cloud-ivory/80"
                style={{
                  fontSize: 'clamp(1.125rem, 2.1vw, 1.5rem)',
                  lineHeight: 1.35,
                  fontVariationSettings: '"opsz" 36, "SOFT" 0',
                }}
              >
                What IRCTC Tatkal should have been.
              </p>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-4">
              <Link
                href="/book"
                className={buttonVariants({
                  size: 'lg',
                  className:
                    'group h-12 gap-2 rounded-none bg-train-red px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory transition-all duration-200 hover:bg-train-red-dark hover:text-paper',
                })}
              >
                Try booking
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/ops"
                className={buttonVariants({
                  size: 'lg',
                  variant: 'outline',
                  className:
                    'h-12 gap-2 rounded-none border-cloud-ivory/40 bg-transparent px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory hover:border-cloud-ivory hover:bg-cloud-ivory/5 hover:text-cloud-ivory',
                })}
              >
                See it running
              </Link>
            </div>
          </div>

          {/* Right: mounted illustration plate with hard shadow + caption. */}
          <div className="order-1 lg:order-2 lg:col-span-5 lg:self-center">
            <figure className="group relative">
              {/* Corner tick-marks — printer's crop registration marks. */}
              <span
                aria-hidden
                className="absolute -left-3 -top-3 hidden h-4 w-4 border-l border-t border-cloud-ivory/30 md:block"
              />
              <span
                aria-hidden
                className="absolute -right-3 -bottom-3 hidden h-4 w-4 border-r border-b border-cloud-ivory/30 md:block"
              />
              {/* The plate. Hard offset shadow reads as print-on-paper, not
                  web-glossy. Slight ivory inner border reads as museum mount. */}
              <div className="relative border border-cloud-ivory/15 shadow-[10px_10px_0_rgba(10,10,10,0.55)] transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                <Image
                  src="/hero_image.png"
                  alt="Illustration — red passenger train crossing a stone-arch viaduct over a mountain lake, snow-capped peaks and cloud bank in the distance. Flat-colour style referencing Swiss SBB editorial."
                  width={1332}
                  height={755}
                  priority
                  sizes="(max-width: 1024px) 100vw, 44vw"
                  className="block h-auto w-full select-none"
                />
                {/* Tonal scrim to blend plate into the ink field. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/25 via-transparent to-transparent"
                />
              </div>
              {/* Caption — magazine plate annotation. */}
              <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-[10px] uppercase tracking-[0.22em] text-cloud-ivory/50 sm:text-[11px]">
                <span>
                  <span className="text-cloud-ivory/80">Plate № 01</span>
                  <span className="ml-3 text-cloud-ivory/30">·</span>
                  <span className="ml-3">ill. flat-plate</span>
                </span>
                <span className="text-cloud-ivory/35">edition of one</span>
              </figcaption>
            </figure>
          </div>
        </div>

        {/* Foot strip — ticker of correctness primitives + scroll chevron. */}
        <div className="relative z-10 border-t border-cloud-ivory/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.28em] text-cloud-ivory/45 sm:text-[11px]">
            <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
              <span className="hidden shrink-0 text-cloud-ivory/25 sm:inline">◂</span>
              <span className="flex min-w-0 items-center gap-4 truncate">
                <span className="shrink-0">Effectively-once execution</span>
                <span aria-hidden className="shrink-0 text-cloud-ivory/20">
                  ·
                </span>
                <span className="hidden shrink-0 sm:inline">FOR UPDATE SKIP LOCKED</span>
                <span aria-hidden className="hidden shrink-0 text-cloud-ivory/20 sm:inline">
                  ·
                </span>
                <span className="hidden shrink-0 md:inline">Stripe-contract idempotency</span>
                <span aria-hidden className="hidden shrink-0 text-cloud-ivory/20 md:inline">
                  ·
                </span>
                <span className="hidden shrink-0 lg:inline">QStash flow control</span>
              </span>
            </div>
            <a
              href="#problem"
              className="group flex shrink-0 items-center gap-2 text-cloud-ivory/60 transition-colors hover:text-cloud-ivory"
            >
              <span>Scroll</span>
              <ArrowDown className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-y-0.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="border-b scroll-mt-16">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              The failure mode is admission, not capacity.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every system below collapsed under traffic surges it had seen before.
              Not because Postgres is slow or Node is slow — because none of them
              refused new work fast enough. Users hang. Payments clear. Tickets don&apos;t.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CASE_STUDIES.map((c) => (
              <Card key={c.system} className="h-full border-zinc-800/60 bg-zinc-950/40">
                <CardHeader className="pb-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {c.system}
                  </div>
                  <div
                    className="mt-2 font-bold tabular-nums text-[#00D084]"
                    style={{
                      fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                      fontFamily: '"Anton", "Bebas Neue", system-ui, sans-serif',
                      lineHeight: 0.95,
                    }}
                  >
                    {c.headline}
                  </div>
                  <CardTitle className="mt-1 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                    {c.subhead}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{c.pain}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Solution — 6 plain-English promises */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Six promises the system keeps under any load.
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Not marketing adjectives — testable invariants. Every one is exercised by a chaos
            script in /ops before every demo.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['01', 'No duplicate seats', 'SKIP LOCKED + bookings.idempotency_key UNIQUE make double-allocation structurally impossible.'],
              ['02', 'No lost bookings', 'Every accepted request terminates CONFIRMED / FAILED / EXPIRED / DLQ. Ingress == sum.'],
              ['03', 'No silent hangs', 'Every response within maxDuration=60s. Usually <200ms — even rejections.'],
              ['04', 'No double charges', 'Same idempotency_key → same payment_id. Retries replay the cached row.'],
              ['05', 'No orphan holds', 'Sweeper releases any RESERVED seat past its held_until. Guarded by advisory lock.'],
              ['06', 'No bot leapfrog', 'Admission gates on identity, not speed. 97%-accurate hot path, 100% admin limiter.'],
            ].map(([n, title, desc]) => (
              <Card key={n} className="h-full border-zinc-800/60 bg-zinc-950/40">
                <CardHeader className="pb-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-[#00D084]">
                    {n}
                  </div>
                  <CardTitle className="mt-1 text-base font-medium">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{desc}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Three defense lines — quote block */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            The three sentences we can defend live.
          </h2>
          <div className="mt-10 space-y-6">
            {[
              {
                n: '01',
                tag: 'Impossibility',
                quote:
                  'Exactly-once delivery is provably impossible (Two Generals / FLP). We deliver effectively-once execution: at-least-once transport plus idempotent consumers at Redis and Postgres.',
              },
              {
                n: '02',
                tag: 'Ownership',
                quote:
                  'QStash is our at-least-once transport. The orchestration — admission, idempotency, allocation, sweeper, breaker, metrics — is ~2,000 lines we wrote.',
              },
              {
                n: '03',
                tag: 'Root cause',
                quote:
                  'Admission control, not capacity, was the failure mode in IRCTC / Coldplay BMS / CoWIN / Ticketmaster. We rate-limit by identity with bounded worker concurrency and fail closed with honest 429 / 503 + Retry-After.',
              },
            ].map((b) => (
              <blockquote
                key={b.n}
                className="relative rounded-lg border-l-4 border-[#00D084] bg-zinc-950/40 py-5 pl-6 pr-6"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#00D084]">
                    {b.n} · {b.tag}
                  </span>
                </div>
                <p className="mt-2 text-base leading-relaxed sm:text-lg">{b.quote}</p>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* CTAs strip */}
      <section className="border-b bg-zinc-950/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Try it yourself.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Book a seat end-to-end, then watch the ops dashboard as it happens.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/book"
              className={buttonVariants({
                size: 'lg',
                className:
                  'gap-2 bg-[#00D084] text-black hover:bg-[#00D084]/90 font-mono uppercase tracking-widest text-xs px-6',
              })}
            >
              Try booking <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/ops"
              className={buttonVariants({
                size: 'lg',
                variant: 'outline',
                className: 'gap-2 font-mono uppercase tracking-widest text-xs px-6',
              })}
            >
              See it running
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800/60 bg-zinc-950/60">
        <div className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono">
            <div className="uppercase tracking-widest">
              Trains and Tracks · hackathon build · 2026-04-18
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="https://github.com/praanshuranjan321/trains-and-tracks"
                target="_blank"
                rel="noreferrer"
                className="uppercase tracking-widest hover:text-foreground"
              >
                GitHub
              </a>
              <a
                href="https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/ARCHITECTURE.md"
                target="_blank"
                rel="noreferrer"
                className="uppercase tracking-widest hover:text-foreground"
              >
                Architecture
              </a>
              <a
                href="https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/DECISIONS.md"
                target="_blank"
                rel="noreferrer"
                className="uppercase tracking-widest hover:text-foreground"
              >
                Decisions
              </a>
              <a
                href="https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/FAILURE_MATRIX.md"
                target="_blank"
                rel="noreferrer"
                className="uppercase tracking-widest hover:text-foreground"
              >
                Failure matrix
              </a>
            </div>
          </div>
          <div className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Hero photo:{' '}
            <a
              href="https://www.pexels.com/photo/train-station-2031024/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Pexels
            </a>{' '}
            · Licensed free for commercial use.
          </div>
        </div>
      </footer>
    </main>
  );
}
