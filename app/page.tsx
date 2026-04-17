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
    event: 'Daily 10 AM AC booking',
    pain: '50% of first-5-minute login traffic is bot-driven (Ministry of Railways, 2025). Payment deducted before seat confirmed — legitimate users lose seats to bots.',
  },
  {
    system: 'BookMyShow · Coldplay India',
    event: 'Sept 2024',
    pain: '13M queued for ~150K tickets — 305× demand. Global queue key, weak bot mitigation. Pre-sale logged-in users auto-logged-out at T=0. Mumbai EOW complaint alleged 9 lakh of 12 lakh ahead in queue were bots.',
  },
  {
    system: 'CoWIN',
    event: '28 Apr 2021, 18–44 registration',
    pain: 'Public 5-minute-cached availability endpoint weaponized by getjab.in / Telegram bots polling every 5 s. Human UI users never saw an open slot.',
  },
  {
    system: 'Ticketmaster · Eras Tour',
    event: 'Nov 2022',
    pain: '3.5B system requests — 4× previous peak. Verified Fan gated entry but not checkout throughput. Cart holds weren\'t reliably held. Senate Judiciary hearing followed.',
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
          <div className="grid gap-4 sm:grid-cols-2">
            {CASE_STUDIES.map((c) => (
              <Card key={c.system} className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-base">{c.system}</CardTitle>
                  <div className="text-xs text-muted-foreground">{c.event}</div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {c.pain}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Three defense lines */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Three claims we can defend live.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <div>
              <div className="text-sm font-mono text-muted-foreground">01</div>
              <h3 className="mt-2 text-lg font-medium">Effectively-once execution</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Exactly-once delivery is impossible (Two Generals / FLP). We compose
                at-least-once transport with idempotent consumers at Redis and Postgres.
              </p>
            </div>
            <div>
              <div className="text-sm font-mono text-muted-foreground">02</div>
              <h3 className="mt-2 text-lg font-medium">Orchestration is ours</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                QStash is the at-least-once transport. The admission, idempotency,
                allocation, sweeper, breaker, metrics — ~2,000 lines we wrote.
              </p>
            </div>
            <div>
              <div className="text-sm font-mono text-muted-foreground">03</div>
              <h3 className="mt-2 text-lg font-medium">Admission-controlled by design</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Rate-limit by identity, bound worker concurrency, fail closed with
                honest 429 / 503 + Retry-After. No silent drops.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-xs text-muted-foreground">
        <div className="font-mono">Trains and Tracks · hackathon build · 2026-04-17</div>
      </footer>
    </main>
  );
}
