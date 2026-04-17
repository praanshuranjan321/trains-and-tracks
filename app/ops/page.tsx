'use client';

// /ops — operator dashboard.
//   - Recharts "Live bookings/sec" hero (via /api/insights proxy, 2s poll)
//   - Grafana Shared Dashboard iframe slot (URL from NEXT_PUBLIC_GRAFANA_DASHBOARD_URL when set)
//   - Big red SIMULATE SURGE button (admin-gated)
//   - Kill Worker button (chaos demo)
//   - Reset button
//
// Admin auth: the operator pastes ADMIN_SECRET into the field below and it's
// stashed in sessionStorage. Yes, that's informal — this is a single-operator
// hackathon demo, not a multi-tenant SaaS. ADR-014 (anon bookings, no auth
// layer) explicitly defers real RBAC as orthogonal to the correctness problem.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Play, RefreshCw, Skull, Trash2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface InsightPoint {
  t: number;
  v: number;
}

interface InsightResp {
  metric: string;
  unit: string;
  points: InsightPoint[];
}

const POLL_MS = 2000;
const HERO_RANGE = '60s';
const SS_KEY = 'admin_secret';

function useInsight(metric: string, range = '5m', step = '5s'): InsightPoint[] {
  const [points, setPoints] = useState<InsightPoint[]>([]);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/insights/${metric}?range=${range}&step=${step}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as InsightResp;
        if (alive) setPoints(body.points ?? []);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [metric, range, step]);
  return points;
}

export default function OpsPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(SS_KEY) : null;
    if (saved) setAdminSecret(saved);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (adminSecret) sessionStorage.setItem(SS_KEY, adminSecret);
  }, [adminSecret]);

  const bookingsPerSec = useInsight('bookings_per_sec', HERO_RANGE, '2s');
  const ingressPerSec = useInsight('ingress_per_sec');
  const rejectionsPerSec = useInsight('rejections_per_sec');
  const p95Latency = useInsight('p95_latency_ms');
  const p99Latency = useInsight('p99_latency_ms');
  const queueDepth = useInsight('queue_depth');
  const dlqCount = useInsight('dlq_count');

  const heroData = useMemo(
    () =>
      bookingsPerSec.map((p) => ({
        t: new Date(p.t * 1000).toLocaleTimeString('en-GB', { hour12: false }),
        v: Math.round(p.v * 100) / 100,
      })),
    [bookingsPerSec],
  );

  const latestValue = (series: InsightPoint[]): number | null =>
    series.length ? series[series.length - 1]!.v : null;

  const callAdmin = useCallback(
    async (path: string, body: Record<string, unknown> | null, label: string) => {
      if (!adminSecret) {
        setLastAction('Paste the admin secret first.');
        return;
      }
      setBusy(label);
      setLastAction(null);
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminSecret}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        setLastAction(`${label}: HTTP ${res.status} · ${text.slice(0, 180)}`);
      } catch (e) {
        setLastAction(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(null);
      }
    },
    [adminSecret],
  );

  const simulate = () =>
    callAdmin(
      '/api/simulate',
      { trainId: '12951', requestCount: 500, windowSeconds: 30 },
      'Simulate surge (500 req / 30 s)',
    );
  const kill = () =>
    callAdmin('/api/admin/kill-worker', { failNextN: 3, failureMode: '500' }, 'Kill next 3 worker runs');
  const reset = () =>
    callAdmin('/api/admin/reset', { confirm: 'reset', trainId: '12951' }, 'Reset demo state');
  const refresh = () => window.location.reload();

  const grafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_DASHBOARD_URL;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              ← trains and tracks
            </Link>
            <div id="rate-limiter-pill" className="flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              rate limiter · 100/10s
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00D084] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00D084]" />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#00D084]">
                system healthy
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh} className="gap-2 font-mono text-[10px] uppercase tracking-widest">
              <RefreshCw className="h-3 w-3" /> reload
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Admin controls strip */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm text-muted-foreground">
              ADMIN · chaos controls
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px] space-y-1.5">
              <Label htmlFor="admin-secret">ADMIN_SECRET</Label>
              <Input
                id="admin-secret"
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="paste ADMIN_SECRET"
                className="font-mono"
              />
            </div>
            <Button onClick={simulate} disabled={busy !== null} variant="destructive" className="gap-2">
              <Play className="h-4 w-4" /> Simulate surge
            </Button>
            <Button onClick={kill} disabled={busy !== null} variant="outline" className="gap-2">
              <Skull className="h-4 w-4" /> Kill next 3
            </Button>
            <Button onClick={reset} disabled={busy !== null} variant="outline" className="gap-2">
              <Trash2 className="h-4 w-4" /> Reset
            </Button>
          </CardContent>
          {lastAction && (
            <CardContent className="pt-0">
              <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                {lastAction}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Hero chart — bookings/sec last 60s */}
        <Card className="border-zinc-800/60 bg-zinc-950/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-baseline justify-between font-mono text-[11px] font-normal uppercase tracking-widest text-muted-foreground">
              <span>bookings / sec · last 60s</span>
              <span className="font-mono text-4xl tabular-nums text-[#00D084]">
                {latestValue(bookingsPerSec)?.toFixed(2) ?? '—'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={heroData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00D084" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00D084" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.22 0 0)" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 10, fill: 'oklch(0.55 0 0)', fontFamily: 'ui-monospace, monospace' }}
                    axisLine={{ stroke: 'oklch(0.22 0 0)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'oklch(0.55 0 0)', fontFamily: 'ui-monospace, monospace' }}
                    axisLine={{ stroke: 'oklch(0.22 0 0)' }}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'oklch(0.12 0 0)',
                      border: '1px solid oklch(0.25 0 0)',
                      borderRadius: 6,
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 11,
                    }}
                    labelStyle={{ color: 'oklch(0.6 0 0)', textTransform: 'uppercase', fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#00D084"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    fill="url(#heroFill)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 6-panel metric grid */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Ingress / s" value={latestValue(ingressPerSec)} />
          <MiniStat label="Queue depth" value={latestValue(queueDepth)} />
          <MiniStat label="Processing / s" value={latestValue(bookingsPerSec)} />
          <MiniStat label="Success / s" value={latestValue(bookingsPerSec)} accent />
          <MiniStat label="Rate-limited / s" value={latestValue(rejectionsPerSec)} />
          <MiniStat label="DLQ count" value={latestValue(dlqCount)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MiniStat label="p95 latency" value={latestValue(p95Latency)} suffix="ms" wide />
          <MiniStat label="p99 latency" value={latestValue(p99Latency)} suffix="ms" wide />
        </div>

        {/* Grafana iframe slot */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-baseline justify-between font-mono text-sm text-muted-foreground">
              <span>GRAFANA · SHARED DASHBOARD</span>
              {grafanaUrl ? (
                <a href={grafanaUrl} target="_blank" rel="noreferrer" className="underline">
                  open in new tab
                </a>
              ) : (
                <span className="flex items-center gap-1 text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> dashboard URL not set
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {grafanaUrl ? (
              <iframe
                title="Grafana"
                src={grafanaUrl}
                className="h-[480px] w-full rounded-md border bg-black"
              />
            ) : (
              <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                Set <code className="mx-1 font-mono text-xs">NEXT_PUBLIC_GRAFANA_DASHBOARD_URL</code> to a Shared Dashboard URL.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  accent,
  wide,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <Card className="border-zinc-800/60 bg-zinc-950/40">
      <CardHeader className="pb-2">
        <CardTitle
          className={`font-mono text-[11px] font-normal uppercase tracking-widest text-muted-foreground ${wide ? 'text-xs' : ''}`}
        >
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`font-mono tabular-nums ${wide ? 'text-4xl' : 'text-3xl'} ${accent ? 'text-[#00D084]' : ''}`}
        >
          {value === null ? '—' : value.toFixed(2)}
          {suffix && <span className="ml-1 text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
