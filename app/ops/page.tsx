'use client';

// /ops — single-page operator dashboard.
//   LEFT  column: hero Recharts chart + 6 KPI tiles + last-10 bookings
//   RIGHT column: admin secret + surge controls + kill/reset + DLQ live
//
// Sized to the viewport so the operator clicks SIMULATE SURGE on the right
// and immediately sees the chart + KPIs light up on the left — no scroll,
// no jumping. Internal scroll only inside the bookings + DLQ lists.
//
// Admin auth: paste ADMIN_SECRET, sessionStorage. Single-operator hackathon
// demo, not a multi-tenant SaaS. ADR-014 (anon bookings, no user auth) still
// applies — this page is operator-gated, not user-gated.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Play, RefreshCw, Skull, Trash2, XCircle } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

interface RecentBooking {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  seatId: string | null;
  passengerName: string;
  failureReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

interface LiveStats {
  inventory: { available: number; reserved: number; confirmed: number };
  bookings: { total: number; pending: number; confirmed: number; failed: number; expired: number };
  dlq: number;
  series: { t: number; confirmed: number; failed: number; ingress: number }[];
}

interface DlqJob {
  id: string;
  qstashMessageId: string;
  errorReason: string;
  attemptCount: number;
  createdAt: string;
  payload: unknown;
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
  const [recent, setRecent] = useState<RecentBooking[]>([]);
  const [surgeN, setSurgeN] = useState<number>(100);
  // Default window = 2s. Smaller is better for the demo: the simulator holds a
  // Redis `simulate:running` lock for (windowSeconds + 10). Larger windows
  // spread requests thinly, making the chart look flat; smaller windows cluster
  // them so the chart spikes visibly and the lock clears fast enough to re-fire.
  const [surgeWindow, setSurgeWindow] = useState<number>(2);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [dlq, setDlq] = useState<DlqJob[]>([]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(SS_KEY) : null;
    if (saved) setAdminSecret(saved);
  }, []);

  // Poll recent bookings — admin-gated, only fires when token present.
  useEffect(() => {
    if (!adminSecret) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/admin/recent-bookings?limit=10', {
          headers: { Authorization: `Bearer ${adminSecret}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { bookings: RecentBooking[] };
        if (alive) setRecent(body.bookings ?? []);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [adminSecret]);

  // Poll live stats (DB-direct). Read bucket, 300/min headroom.
  useEffect(() => {
    if (!adminSecret) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/admin/live-stats', {
          headers: { Authorization: `Bearer ${adminSecret}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as LiveStats;
        if (alive) setLiveStats(body);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [adminSecret]);

  // Poll DLQ — longer interval (10s) since failures are rare. Read bucket.
  useEffect(() => {
    if (!adminSecret) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/admin/dlq?limit=20', {
          headers: { Authorization: `Bearer ${adminSecret}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { jobs: DlqJob[] };
        if (alive) setDlq(body.jobs ?? []);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [adminSecret]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (adminSecret) sessionStorage.setItem(SS_KEY, adminSecret);
  }, [adminSecret]);

  const bookingsPerSec = useInsight('bookings_per_sec', HERO_RANGE, '2s');
  const ingressPerSec = useInsight('ingress_per_sec');
  const rejectionsPerSec = useInsight('rejections_per_sec');
  const queueDepth = useInsight('queue_depth');
  const dlqCount = useInsight('dlq_count');

  // Prefer live-stats DB series (works locally without Grafana push), fall back
  // to Grafana Prometheus proxy when in production with a push pipeline.
  const heroData = useMemo(() => {
    if (liveStats && liveStats.series.length > 0) {
      return liveStats.series.map((p) => ({
        t: new Date(p.t * 1000).toLocaleTimeString('en-GB', { hour12: false }),
        v: p.confirmed,
      }));
    }
    return bookingsPerSec.map((p) => ({
      t: new Date(p.t * 1000).toLocaleTimeString('en-GB', { hour12: false }),
      v: Math.round(p.v * 100) / 100,
    }));
  }, [liveStats, bookingsPerSec]);

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
      { trainId: '12951', requestCount: surgeN, windowSeconds: surgeWindow },
      `Simulate surge (${surgeN.toLocaleString()} req / ${surgeWindow} s)`,
    );
  const kill = () =>
    callAdmin('/api/admin/kill-worker', { failNextN: 3, failureMode: '500' }, 'Kill next 3 worker runs');
  const reset = () =>
    callAdmin('/api/admin/reset', { confirm: 'reset', trainId: '12951' }, 'Reset demo state');
  const refresh = () => window.location.reload();

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Compact header — not sticky because the whole page is viewport-sized */}
      <header className="shrink-0 border-b border-zinc-800/60 bg-background/80">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              ← trains and tracks
            </Link>
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              className="h-7 gap-2 font-mono text-[10px] uppercase tracking-widest"
            >
              <RefreshCw className="h-3 w-3" /> reload
            </Button>
          </div>
        </div>
      </header>

      {/* Two-column dashboard grid. Left 9 cols = chart + KPIs + bookings;
          right 3 cols = admin secret + surge + chaos + DLQ. */}
      <div className="mx-auto flex w-full min-h-0 max-w-[1800px] flex-1 gap-3 px-3 py-3">
        <div className="grid w-full min-h-0 grid-cols-12 gap-3">
          {/* === LEFT ========================================================= */}
          <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-9">
            {/* Hero chart — fills whatever vertical space is left */}
            <Card className="flex min-h-0 flex-1 flex-col border-zinc-800/60 bg-zinc-950/40">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="flex items-baseline justify-between font-mono text-[11px] font-normal uppercase tracking-widest text-muted-foreground">
                  <span>confirmations / sec · last 60s</span>
                  <span className="font-mono text-4xl tabular-nums text-[#00D084]">
                    {liveStats?.series.length
                      ? liveStats.series[liveStats.series.length - 1]!.confirmed.toLocaleString()
                      : latestValue(bookingsPerSec)?.toFixed(2) ?? '—'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 pb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={heroData} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
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
                      minTickGap={32}
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
              </CardContent>
            </Card>

            {/* 6 KPI tiles in one compact horizontal strip */}
            <div className="shrink-0 grid grid-cols-3 gap-2 md:grid-cols-6">
              <MiniStat
                label="Ingress"
                value={liveStats?.bookings.total ?? latestValue(ingressPerSec)}
                raw={liveStats !== null}
                compact
              />
              <MiniStat
                label="Pending"
                value={liveStats?.bookings.pending ?? latestValue(queueDepth)}
                raw={liveStats !== null}
                compact
              />
              <MiniStat
                label="Available"
                value={liveStats?.inventory.available ?? null}
                raw
                compact
              />
              <MiniStat
                label="Confirmed"
                value={liveStats?.bookings.confirmed ?? latestValue(bookingsPerSec)}
                accent
                raw={liveStats !== null}
                compact
              />
              <MiniStat
                label="Failed"
                value={liveStats?.bookings.failed ?? latestValue(rejectionsPerSec)}
                raw={liveStats !== null}
                compact
              />
              <MiniStat
                label="DLQ"
                value={liveStats?.dlq ?? latestValue(dlqCount)}
                raw={liveStats !== null}
                compact
              />
            </div>

            {/* Last 10 bookings — fixed-height panel, internal scroll */}
            <Card className="flex shrink-0 max-h-[210px] flex-col border-zinc-800/60 bg-zinc-950/40">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="font-mono text-[11px] font-normal uppercase tracking-widest text-muted-foreground">
                  last 10 bookings · live
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto pb-2">
                {recent.length === 0 ? (
                  <div className="py-4 text-center font-mono text-xs text-muted-foreground">
                    {adminSecret ? 'no bookings yet' : 'paste admin secret to enable'}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {recent.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-3 py-1.5 font-mono text-[11px]"
                      >
                        <StatusIcon status={b.status} />
                        <span className="w-20 shrink-0 text-muted-foreground">{b.seatId ?? '—'}</span>
                        <span className="flex-1 truncate">{b.passengerName}</span>
                        <span className="text-muted-foreground">
                          {new Date(b.createdAt).toLocaleTimeString('en-GB', { hour12: false })}
                        </span>
                        <span
                          className={`w-24 shrink-0 text-right text-[10px] uppercase tracking-widest ${
                            b.status === 'CONFIRMED'
                              ? 'text-[#00D084]'
                              : b.status === 'PENDING'
                                ? 'text-amber-400'
                                : 'text-destructive'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* === RIGHT ======================================================= */}
          <aside className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-3">
            {/* Admin secret — compact */}
            <Card className="shrink-0 border-zinc-800/60 bg-zinc-950/40">
              <CardContent className="space-y-1.5 py-3">
                <Label
                  htmlFor="admin-secret"
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                >
                  admin secret
                </Label>
                <Input
                  id="admin-secret"
                  type="password"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  placeholder="paste ADMIN_SECRET"
                  className="h-8 font-mono text-xs"
                />
              </CardContent>
            </Card>

            {/* Surge — primary demo action */}
            <Card className="shrink-0 border-red-900/40 bg-red-950/10">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="font-mono text-[10px] font-normal uppercase tracking-widest text-red-400/80">
                  surge · tatkal simulator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      requests
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={100000}
                      step={100}
                      value={surgeN}
                      onChange={(e) =>
                        setSurgeN(Math.min(100000, Math.max(1, Number(e.target.value) || 0)))
                      }
                      className="h-8 font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      window (s)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      value={surgeWindow}
                      onChange={(e) =>
                        setSurgeWindow(Math.min(60, Math.max(1, Number(e.target.value) || 0)))
                      }
                      className="h-8 font-mono tabular-nums"
                    />
                  </div>
                </div>
                <button
                  onClick={simulate}
                  disabled={busy !== null || !adminSecret || surgeN < 1}
                  className="group relative w-full overflow-hidden rounded-md border-2 border-red-500/60 bg-red-500/10 px-3 py-3 font-mono text-xs uppercase tracking-[0.15em] text-red-400 transition-all hover:border-red-500 hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_24px_rgba(239,68,68,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Play className="h-4 w-4" />
                    Simulate Tatkal Surge
                  </span>
                </button>
                <div className="text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {surgeN.toLocaleString()} req · {surgeWindow} s · per-train FIFO
                </div>
              </CardContent>
            </Card>

            {/* Chaos — kill-worker + reset side by side */}
            <Card className="shrink-0 border-zinc-800/60 bg-zinc-950/40">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="font-mono text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
                  chaos
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  onClick={kill}
                  disabled={busy !== null || !adminSecret}
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1.5 font-mono text-[10px] uppercase tracking-widest"
                >
                  <Skull className="h-3 w-3" /> kill 3
                </Button>
                <Button
                  onClick={reset}
                  disabled={busy !== null || !adminSecret}
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1.5 font-mono text-[10px] uppercase tracking-widest"
                >
                  <Trash2 className="h-3 w-3" /> reset
                </Button>
              </CardContent>
            </Card>

            {/* DLQ — live panel, fills remaining vertical space */}
            <Card className="flex min-h-0 flex-1 flex-col border-zinc-800/60 bg-zinc-950/40">
              <CardHeader className="shrink-0 pb-2">
                <CardTitle className="flex items-baseline justify-between font-mono text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
                  <span>dlq · unresolved</span>
                  <span className="font-mono text-base tabular-nums text-foreground">
                    {dlq.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto pb-2">
                {dlq.length === 0 ? (
                  <div className="py-4 text-center font-mono text-[10px] text-muted-foreground">
                    {adminSecret ? 'empty — system healthy' : 'paste admin secret'}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {dlq.map((j) => (
                      <div key={j.id} className="space-y-0.5 py-1.5 font-mono text-[10px]">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="truncate">{j.errorReason}</span>
                          <span className="shrink-0">×{j.attemptCount}</span>
                        </div>
                        <div className="truncate text-[9px] text-muted-foreground/70">
                          {j.qstashMessageId.slice(0, 18)}… ·{' '}
                          {new Date(j.createdAt).toLocaleTimeString('en-GB', { hour12: false })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* Footer action log — appears only when there's something to show */}
      {lastAction && (
        <div className="shrink-0 border-t border-zinc-800/60 bg-zinc-950/60">
          <div className="mx-auto w-full max-w-[1800px] truncate px-4 py-2 font-mono text-[10px] text-muted-foreground">
            {lastAction}
          </div>
        </div>
      )}
    </main>
  );
}

function StatusIcon({ status }: { status: RecentBooking['status'] }) {
  if (status === 'CONFIRMED') return <CheckCircle2 className="h-3.5 w-3.5 text-[#00D084]" />;
  if (status === 'PENDING') return <Clock className="h-3.5 w-3.5 text-amber-400" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
}

function MiniStat({
  label,
  value,
  suffix,
  accent,
  wide,
  raw,
  compact,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  accent?: boolean;
  wide?: boolean;
  /** true = render as integer (counts); false = render as float with 2dp (rates). */
  raw?: boolean;
  /** compact = tighter padding + smaller value text, for the 6-tile strip. */
  compact?: boolean;
}) {
  return (
    <Card className="border-zinc-800/60 bg-zinc-950/40">
      <CardHeader className={compact ? 'pb-0 pt-2.5' : 'pb-2'}>
        <CardTitle
          className={`font-mono font-normal uppercase tracking-widest text-muted-foreground ${
            compact ? 'text-[10px]' : wide ? 'text-xs' : 'text-[11px]'
          }`}
        >
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'pb-2.5' : ''}>
        <div
          className={`font-mono tabular-nums ${
            compact ? 'text-xl' : wide ? 'text-4xl' : 'text-3xl'
          } ${accent ? 'text-[#00D084]' : ''}`}
        >
          {value === null ? '—' : raw ? value.toLocaleString() : value.toFixed(2)}
          {suffix && (
            <span className={`ml-1 text-muted-foreground ${compact ? 'text-[10px]' : 'text-sm'}`}>
              {suffix}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
