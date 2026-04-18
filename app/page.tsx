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
    <main className="min-h-screen bg-ink text-cloud-ivory">
      {/* Hero — full-bleed flat-illustration cover. 100vh. Image as backdrop
          with `object-cover`; content overlaid with dark tonal gradients at
          left/bottom for text legibility without flattening the illustration.
          Rubric rail top + ticker + scroll cue bottom sit on a very subtle
          ink-wash strip. */}
      <section className="relative isolate flex min-h-screen flex-col overflow-hidden bg-ink text-cloud-ivory">
        {/* Full-bleed illustration. object-position nudged right so the train
            on the viaduct stays visible on narrow viewports while the sky/
            mountain space on the left carries the overlay type. */}
        <Image
          src="/hero_image.png"
          alt="Illustration — red passenger train crossing a stone-arch viaduct over a mountain lake, snow-capped peaks and cloud bank in the distance. Flat-colour style referencing Swiss SBB editorial."
          fill
          priority
          sizes="100vw"
          className="-z-20 select-none object-cover object-[65%_50%]"
        />

        {/* Tonal overlays for text legibility. Two gradients layered: one
            darkening the bottom third (footer copy area), one darkening the
            left diagonal (headline + italic sub + CTAs). Neither obscures the
            centerpiece — the train on the viaduct sits in the bright
            "keep-clear" quadrant. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/55 to-ink/0"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-ink/75 via-ink/25 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-ink/70 to-transparent"
        />

        {/* Paper-grain noise over everything — keeps flat digital areas from
            looking CRT-smooth. */}
        <svg
          className="pointer-events-none absolute inset-0 -z-0 h-full w-full opacity-[0.05] mix-blend-overlay"
          aria-hidden
        >
          <filter id="hero-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#hero-grain)" />
        </svg>

        {/* Top rubric bar — departure-card framing, sits on a hairline rule. */}
        <header className="relative z-10 border-b border-cloud-ivory/15 bg-ink/25 backdrop-blur-[2px]">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 font-mono text-[10px] uppercase tracking-[0.22em] text-cloud-ivory/75 sm:text-[11px]">
            <div className="flex items-center gap-3">
              <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-train-red" />
              <span translate="no">Trains &amp; Tracks</span>
              <span aria-hidden className="hidden text-cloud-ivory/30 sm:inline">
                /
              </span>
              <span className="hidden sm:inline">№ 01 · Departures</span>
            </div>
            <div className="hidden items-center gap-5 md:flex">
              <span>NDLS → BCT</span>
              <span aria-hidden className="text-cloud-ivory/30">
                ·
              </span>
              <span>Est. April 2026</span>
            </div>
          </div>
        </header>

        {/* Main overlay content — pinned to the bottom-left over the darker
            quadrant of the image. */}
        <div className="relative z-10 flex flex-1 items-end">
          <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-24 sm:pb-20 lg:pb-24">
            <div className="max-w-[56rem]">
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-train-red sm:text-[11px]">
                <span aria-hidden className="h-px w-8 bg-train-red/80" />
                <span className="drop-shadow-[0_1px_8px_rgba(20,26,28,0.6)]">
                  The Tatkal problem, solved
                </span>
              </div>

              <h1
                className="mt-6 font-serif font-medium uppercase text-balance text-cloud-ivory drop-shadow-[0_2px_16px_rgba(10,12,14,0.55)]"
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
                <span aria-hidden className="mt-3 hidden h-px w-10 shrink-0 bg-cloud-ivory/50 sm:block" />
                <p
                  className="max-w-[38ch] font-serif italic text-cloud-ivory/90 drop-shadow-[0_1px_10px_rgba(10,12,14,0.55)]"
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
                      'group h-12 gap-2 rounded-none bg-train-red px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory shadow-[0_8px_30px_rgba(193,74,74,0.35)] transition-[background-color,color,box-shadow] duration-200 hover:bg-train-red-dark hover:text-paper hover:shadow-[0_10px_40px_rgba(193,74,74,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none',
                  })}
                >
                  Try Booking
                  <ArrowRight
                    aria-hidden
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </Link>
                <Link
                  href="/ops"
                  className={buttonVariants({
                    size: 'lg',
                    variant: 'outline',
                    className:
                      'h-12 gap-2 rounded-none border-cloud-ivory/50 bg-ink/20 px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory backdrop-blur-sm transition-[background-color,border-color,color] duration-200 hover:border-cloud-ivory hover:bg-cloud-ivory/10 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none',
                  })}
                >
                  See It Running
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Foot strip — ticker of correctness primitives + scroll chevron. */}
        <footer className="relative z-10 border-t border-cloud-ivory/15 bg-ink/30 backdrop-blur-[2px]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.28em] text-cloud-ivory/65 sm:text-[11px]">
            <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
              <span aria-hidden className="hidden shrink-0 text-cloud-ivory/35 sm:inline">
                ◂
              </span>
              <span className="flex min-w-0 items-center gap-4 truncate">
                <span className="shrink-0">Effectively-once execution</span>
                <span aria-hidden className="shrink-0 text-cloud-ivory/30">
                  ·
                </span>
                <span className="hidden shrink-0 sm:inline">FOR UPDATE SKIP LOCKED</span>
                <span aria-hidden className="hidden shrink-0 text-cloud-ivory/30 sm:inline">
                  ·
                </span>
                <span className="hidden shrink-0 md:inline">Stripe-contract idempotency</span>
                <span aria-hidden className="hidden shrink-0 text-cloud-ivory/30 md:inline">
                  ·
                </span>
                <span className="hidden shrink-0 lg:inline">QStash flow control</span>
              </span>
            </div>
            <a
              href="#problem"
              className="group flex shrink-0 items-center gap-2 rounded-sm px-1 text-cloud-ivory/75 transition-colors duration-200 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none"
            >
              <span>Scroll</span>
              <ArrowDown
                aria-hidden
                className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
              />
            </a>
          </div>
        </footer>
      </section>

      {/* Problem — editorial case-study register. 4 entries split by hairlines
          (horizontal on mobile, vertical on desktop). Big mono tabular number
          per entry + serif italic caption + sans body prose. No cards, no
          background boxes — all structure is type + rule. */}
      <section
        id="problem"
        className="scroll-mt-16 border-t border-cloud-ivory/10 bg-ink"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-train-red sm:text-[11px]">
              <span aria-hidden className="h-px w-8 bg-train-red/70" />
              §01 · The problem
            </div>
            <h2
              className="mt-6 font-serif text-balance text-cloud-ivory"
              style={{
                fontSize: 'clamp(2rem, 4.6vw, 3.75rem)',
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
                fontVariationSettings: '"opsz" 144, "SOFT" 0',
              }}
            >
              The failure mode is admission, not capacity.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-cloud-ivory/70 sm:text-lg">
              Every system below collapsed under traffic surges it had seen
              before. Not because Postgres is slow or Node is slow — because
              none of them refused new work fast enough. Users hang. Payments
              clear. Tickets don&apos;t.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 border-t border-cloud-ivory/10 lg:grid-cols-4 lg:border-t-0">
            {CASE_STUDIES.map((c) => (
              <article
                key={c.system}
                className="flex flex-col gap-5 border-b border-cloud-ivory/10 px-0 py-10 last:border-b-0 sm:px-2 lg:border-b-0 lg:border-r lg:px-8 lg:py-0 lg:last:border-r-0"
              >
                <header className="font-mono text-[11px] uppercase tracking-[0.22em] text-cloud-ivory/60">
                  {c.system}
                </header>
                <div
                  className="font-mono font-medium tabular-nums text-cloud-ivory"
                  style={{
                    fontSize: 'clamp(3rem, 6vw, 4.5rem)',
                    lineHeight: 0.95,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {c.headline}
                </div>
                <p
                  className="font-serif italic text-cloud-ivory/70"
                  style={{ fontSize: '0.95rem', lineHeight: 1.45 }}
                >
                  — {c.subhead}
                </p>
                <div aria-hidden className="h-px w-10 bg-cloud-ivory/20" />
                <p className="text-sm leading-relaxed text-cloud-ivory/75">
                  {c.pain}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Six promises — numbered register. Big serif numerals anchor each
          entry; sans Inter statement follows; italic serif caption elaborates.
          Same hairline-grid language as the problem section. */}
      <section className="border-t border-cloud-ivory/10 bg-ink">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-train-red sm:text-[11px]">
              <span aria-hidden className="h-px w-8 bg-train-red/70" />
              §02 · The promises
            </div>
            <h2
              className="mt-6 font-serif text-balance text-cloud-ivory"
              style={{
                fontSize: 'clamp(2rem, 4.6vw, 3.75rem)',
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
                fontVariationSettings: '"opsz" 144, "SOFT" 0',
              }}
            >
              Six promises the system keeps under any load.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-cloud-ivory/70 sm:text-lg">
              Not marketing adjectives — testable invariants. Every one is
              exercised by a chaos script in{' '}
              <Link
                href="/ops"
                className="text-cloud-ivory underline decoration-train-red/70 decoration-2 underline-offset-4 transition-colors hover:decoration-train-red"
              >
                /ops
              </Link>{' '}
              before every demo.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 border-t border-cloud-ivory/10 md:grid-cols-2 lg:grid-cols-3">
            {[
              ['01', 'No duplicate seats', 'SKIP LOCKED and the bookings.idempotency_key UNIQUE constraint make double-allocation structurally impossible.'],
              ['02', 'No lost bookings', 'Every accepted request terminates CONFIRMED, FAILED, EXPIRED, or DLQ. Ingress equals the sum.'],
              ['03', 'No silent hangs', 'Every response within maxDuration=60s. Usually under 200 ms — even the rejections.'],
              ['04', 'No double charges', 'Same idempotency_key → same payment_id. Retries replay the cached row.'],
              ['05', 'No orphan holds', 'The sweeper releases any RESERVED seat past its held_until. Guarded by an advisory lock.'],
              ['06', 'No bot leapfrog', 'Admission gates on identity, not speed. 97%-accurate hot path, 100% admin limiter.'],
            ].map(([n, title, desc]) => (
              <article
                key={n}
                className="group flex flex-col gap-4 border-b border-cloud-ivory/10 px-0 py-10 last:border-b-0 md:border-r md:px-6 md:[&:nth-child(2n)]:border-r-0 md:last:border-b md:[&:nth-last-child(2)]:border-b lg:px-8 lg:py-12 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
              >
                <div
                  className="font-serif font-light text-cloud-ivory/85 transition-colors duration-300 group-hover:text-train-red motion-reduce:transition-none"
                  style={{
                    fontSize: 'clamp(3rem, 5.5vw, 4.5rem)',
                    lineHeight: 0.9,
                    letterSpacing: '-0.02em',
                    fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
                  }}
                >
                  {n}
                </div>
                <h3 className="text-xl font-medium tracking-tight text-cloud-ivory sm:text-2xl">
                  {title}
                </h3>
                <p
                  className="font-serif italic text-cloud-ivory/70"
                  style={{ fontSize: '1rem', lineHeight: 1.5 }}
                >
                  {desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Three defense lines — full-width centered pull quotes. Serif italic,
          large, separated by hairlines. Echoes the PRD §1 three-sentence
          defense verbatim. */}
      <section className="border-t border-cloud-ivory/10 bg-ink">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="flex items-center justify-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-train-red sm:text-[11px]">
              <span aria-hidden className="h-px w-8 bg-train-red/70" />
              §03 · The defense
              <span aria-hidden className="h-px w-8 bg-train-red/70" />
            </div>
            <h2
              className="mt-6 font-serif text-balance text-cloud-ivory"
              style={{
                fontSize: 'clamp(2rem, 4.6vw, 3.75rem)',
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
                fontVariationSettings: '"opsz" 144, "SOFT" 0',
              }}
            >
              Three sentences we can defend live.
            </h2>
          </div>

          <div className="mt-16 divide-y divide-cloud-ivory/10 border-t border-cloud-ivory/10">
            {[
              {
                n: '01',
                tag: 'Impossibility',
                quote:
                  'Exactly-once delivery is provably impossible — Two Generals, FLP. We deliver effectively-once execution: at-least-once transport plus idempotent consumers at Redis and Postgres.',
              },
              {
                n: '02',
                tag: 'Ownership',
                quote:
                  'QStash is our at-least-once transport. The orchestration — admission, idempotency, allocation, sweeper, breaker, metrics — is roughly two thousand lines we wrote.',
              },
              {
                n: '03',
                tag: 'Root cause',
                quote:
                  'Admission control, not capacity, was the failure mode in IRCTC, Coldplay BMS, CoWIN, Ticketmaster. We rate-limit by identity with bounded worker concurrency and fail closed with honest 429 / 503 and Retry-After.',
              },
            ].map((b) => (
              <figure key={b.n} className="py-14 text-center sm:py-20">
                <figcaption className="order-1 flex items-center justify-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-cloud-ivory/55 sm:text-[11px]">
                  <span className="text-train-red/90">№ {b.n}</span>
                  <span aria-hidden className="text-cloud-ivory/20">
                    ·
                  </span>
                  <span>{b.tag}</span>
                </figcaption>
                <blockquote
                  cite={`Trains and Tracks PRD §1 · defense ${b.n}`}
                  className="mx-auto mt-6 max-w-4xl font-serif italic text-cloud-ivory text-balance"
                  style={{
                    fontSize: 'clamp(1.35rem, 3vw, 2.5rem)',
                    lineHeight: 1.25,
                    letterSpacing: '-0.01em',
                    fontVariationSettings: '"opsz" 72, "SOFT" 50',
                  }}
                >
                  <span aria-hidden className="mr-2 text-train-red/80">
                    &ldquo;
                  </span>
                  {b.quote}
                  <span aria-hidden className="ml-1 text-train-red/80">
                    &rdquo;
                  </span>
                </blockquote>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip — closing call to action. Same palette as hero CTAs for
          rhythm; headline is serif italic for pull-quote feel. */}
      <section className="border-t border-cloud-ivory/10 bg-ink">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-6 py-20 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-train-red sm:text-[11px]">
              Try it yourself
            </div>
            <h2
              className="mt-4 font-serif italic text-balance text-cloud-ivory"
              style={{
                fontSize: 'clamp(1.75rem, 3.6vw, 3rem)',
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                fontVariationSettings: '"opsz" 72, "SOFT" 50',
              }}
            >
              Book a seat end-to-end, then watch the ops dashboard as it happens.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/book"
              className={buttonVariants({
                size: 'lg',
                className:
                  'group h-12 gap-2 rounded-none bg-train-red px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory transition-[background-color,color,box-shadow] duration-200 hover:bg-train-red-dark hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none',
              })}
            >
              Try Booking
              <ArrowRight
                aria-hidden
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              />
            </Link>
            <Link
              href="/ops"
              className={buttonVariants({
                size: 'lg',
                variant: 'outline',
                className:
                  'h-12 gap-2 rounded-none border-cloud-ivory/40 bg-transparent px-7 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cloud-ivory transition-[background-color,border-color,color] duration-200 hover:border-cloud-ivory hover:bg-cloud-ivory/5 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none',
              })}
            >
              See It Running
            </Link>
          </div>
        </div>
      </section>

      {/* Footer — magazine colophon. Three-column grid of link lists + a
          hairline + fine-print attribution row. Serif for section labels,
          mono for the links + colophon, sans-sm body for prose. */}
      <footer className="border-t border-cloud-ivory/10 bg-ink">
        <div className="mx-auto max-w-7xl px-6 py-16">
          {/* Top row — brand + edition colophon */}
          <div className="flex flex-wrap items-end justify-between gap-8 border-b border-cloud-ivory/10 pb-10">
            <div>
              <div
                className="font-serif font-medium text-cloud-ivory"
                style={{
                  fontSize: 'clamp(1.75rem, 3vw, 2.75rem)',
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                  fontVariationSettings: '"opsz" 144, "SOFT" 0',
                }}
              >
                <span translate="no">Trains &amp; Tracks</span>
              </div>
              <p className="mt-2 font-serif italic text-cloud-ivory/60" style={{ fontSize: '1rem' }}>
                A reservation engine that survives Tatkal.
              </p>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cloud-ivory/50 sm:text-[11px]">
              <div>Edition 01 · Hackathon Build</div>
              <div className="mt-1 text-cloud-ivory/30">
                <time dateTime="2026-04-18">April 18, 2026</time> · New Delhi
              </div>
            </div>
          </div>

          {/* Link columns */}
          <div className="mt-10 grid grid-cols-2 gap-10 md:grid-cols-4">
            <FootCol
              label="Repository"
              links={[
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks', text: 'GitHub' },
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks/tree/main/app', text: 'App source' },
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks/tree/main/lib', text: 'Orchestration' },
              ]}
            />
            <FootCol
              label="Documentation"
              links={[
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/PRD.md', text: 'PRD' },
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/CONCEPTS.md', text: 'Concepts' },
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/DECISIONS.md', text: 'Decisions' },
                { href: 'https://github.com/praanshuranjan321/trains-and-tracks/blob/main/docs/FAILURE_MATRIX.md', text: 'Failure matrix' },
              ]}
            />
            <FootCol
              label="Live"
              links={[
                { href: '/book', text: 'Book a seat', internal: true },
                { href: '/ops', text: 'Operator dashboard', internal: true },
              ]}
            />
            <FootCol
              label="Colophon"
              links={[
                { href: 'https://fonts.google.com/specimen/Fraunces', text: 'Fraunces (display)' },
                { href: 'https://fonts.google.com/specimen/Inter', text: 'Inter (body)' },
                { href: 'https://fonts.google.com/specimen/JetBrains+Mono', text: 'JetBrains Mono' },
              ]}
            />
          </div>

          {/* Fine print */}
          <div className="mt-12 flex flex-col gap-3 border-t border-cloud-ivory/10 pt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-cloud-ivory/40 sm:flex-row sm:items-center sm:justify-between sm:text-[11px]">
            <div>
              © 2026 · Built in 17 hours · MIT License · No production data · No
              real payments
            </div>
            <div className="text-cloud-ivory/30">
              Plate N°01 · flat-plate illustration · ed. of one
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

// Footer column — serif label + list of mono links. Extracted to keep the
// footer markup declarative; no state so a plain function is fine in this RSC.
function FootCol({
  label,
  links,
}: {
  label: string;
  links: { href: string; text: string; internal?: boolean }[];
}) {
  return (
    <div>
      <div
        className="font-serif italic text-cloud-ivory/85"
        style={{ fontSize: '1rem', letterSpacing: '-0.005em' }}
      >
        {label}
      </div>
      <ul className="mt-4 space-y-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-cloud-ivory/55">
        {links.map((l) =>
          l.internal ? (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-block rounded-sm transition-colors duration-150 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none"
              >
                {l.text}
              </Link>
            </li>
          ) : (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-sm transition-colors duration-150 hover:text-cloud-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:transition-none"
              >
                {l.text}
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
