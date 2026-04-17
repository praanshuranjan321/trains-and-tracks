// Landing — RSC. Pulls the problem narrative from PRD §2.1 and wires two
// CTAs: /book for the happy path, /ops for the judge demo. No hero video in
// MVP (Phase 7 polish); placeholder gradient keeps the layout from looking
// empty.

import Link from 'next/link';
import { ArrowRight, Train } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
      {/* Hero — Pexels crowded-station bg + dark gradient overlay */}
      <section className="relative overflow-hidden border-b">
        <div
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{
            backgroundImage:
              'url(https://images.pexels.com/photos/2031024/pexels-photo-2031024.jpeg?auto=compress&cs=tinysrgb&w=1920)',
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="mx-auto max-w-6xl px-6 py-28 sm:py-40">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Train className="h-4 w-4" />
            <span className="font-mono uppercase tracking-widest text-[11px]">Trains and Tracks</span>
          </div>
          <h1
            className="mt-8 font-bold uppercase leading-[0.9] tracking-tight text-foreground"
            style={{
              fontSize: 'clamp(4rem, 10vw, 8rem)',
              fontFamily: '"Anton", "Bebas Neue", "Impact", system-ui, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            Exactly once.
            <span className="block text-[#00D084]">Every time.</span>
          </h1>
          <p
            className="mt-8 max-w-2xl font-mono text-sm uppercase tracking-widest text-muted-foreground sm:text-base"
            style={{ letterSpacing: '0.15em' }}
          >
            A reservation engine that survives Tatkal. No duplicates. No hangs. No silent drops.
          </p>
          <div className="mt-12 flex flex-wrap gap-3">
            <Link
              href="/book"
              className={buttonVariants({
                size: 'lg',
                className: 'gap-2 bg-[#00D084] text-black hover:bg-[#00D084]/90 font-mono uppercase tracking-widest text-xs px-6',
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
          <div className="mt-10 flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="font-mono">FOR UPDATE SKIP LOCKED</Badge>
            <Badge variant="secondary" className="font-mono">Stripe idempotency contract</Badge>
            <Badge variant="secondary" className="font-mono">QStash Flow Control</Badge>
            <Badge variant="secondary" className="font-mono">Cockatiel breaker</Badge>
            <Badge variant="secondary" className="font-mono">Custom Lua sliding-window-log</Badge>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b">
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

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-xs text-muted-foreground">
        <div className="font-mono">Trains and Tracks · hackathon build · 2026-04-17</div>
      </footer>
    </main>
  );
}
