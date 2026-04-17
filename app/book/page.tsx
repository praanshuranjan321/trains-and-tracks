'use client';

// Seat grid + book + poll. Minimal CSS-grid layout for MVP; Phase 7 polishes
// the visual language. 20 coaches × 25 seats per ADR-022; click a seat to
// open the confirm dialog, submit → POST /api/book → poll /api/book/:jobId
// until terminal. Errors (502 tombstone, 429 rate limit, 400 sold out) get
// explicit messages so the user knows what to do.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SeatInfo {
  id: string;
  coach: string;
  seatNumber: string;
  status: 'AVAILABLE' | 'RESERVED' | 'CONFIRMED';
}

interface SeatGridResp {
  trainId: string;
  total: number;
  available: number;
  reserved: number;
  confirmed: number;
  seats: SeatInfo[];
}

interface BookingPollResp {
  jobId: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  seatId: string | null;
  failureReason: string | null;
  confirmedAt: string | null;
}

const TRAIN_ID = '12951';
const POLL_MS = 1000;
const POLL_MAX = 60;

// Map error.code (canonical set from API_CONTRACT §3) to a user-facing sentence.
// Exact match on the code — no substring sniffing (an earlier substring match
// turned "enqueue" into "queue" and mislabeled publish failures as backpressure).
function friendlyReason(code: string): string {
  switch (code) {
    case 'sold_out':
      return 'Every seat on this train is booked. Try the next Rajdhani or reset the demo from /ops.';
    case 'payment_failed':
    case 'payment_declined':
      return 'Payment gateway declined after 3 retries. No money was charged. Pick another seat and try again.';
    case 'payment_timeout':
      return 'Payment gateway timed out. No charge. Please pick a seat and retry.';
    case 'hold_expired':
    case 'hold_expired_during_payment':
      return 'The seat hold expired before payment completed. The seat is back in the pool — try booking again.';
    case 'rate_limit_exceeded':
      return 'Too many requests from your IP. Wait ~10 seconds and retry.';
    case 'backpressure':
      return 'Queue is saturated right now. Wait a few seconds and retry.';
    case 'upstream_failure':
      return "Couldn't enqueue the booking (QStash publish failed or quota). Retry with a fresh click.";
    case 'circuit_open':
      return 'Database circuit breaker is open. Wait ~30s and retry.';
    case 'idempotency_key_replaying':
      return 'An earlier request with this key is still processing. Poll /api/book/:jobId or wait.';
    case 'internal_error':
      return 'Server hit an unexpected error. Please retry.';
    default:
      return code.replace(/_/g, ' ');
  }
}

function statusColor(s: SeatInfo['status'], selected: boolean) {
  if (selected) {
    return 'bg-[#00D084] text-black border-[#00D084] shadow-[0_0_14px_rgba(0,208,132,0.6)]';
  }
  if (s === 'AVAILABLE') {
    return 'border-white/50 text-white/70 hover:border-white hover:bg-white/5 cursor-pointer';
  }
  if (s === 'RESERVED') {
    return 'bg-amber-500/60 text-amber-50 border-amber-500/60 animate-pulse cursor-not-allowed';
  }
  // CONFIRMED
  return 'bg-zinc-700/60 text-zinc-500 border-zinc-700/60 cursor-not-allowed';
}

export default function BookPage() {
  const [grid, setGrid] = useState<SeatGridResp | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<
    | { kind: 'idle' }
    | { kind: 'polling'; jobId: string; attempt: number }
    | { kind: 'success'; seatId: string; jobId: string }
    | { kind: 'failure'; reason: string; jobId?: string }
  >({ kind: 'idle' });

  const refreshGrid = useCallback(async () => {
    try {
      const res = await fetch(`/api/seats?train_id=${TRAIN_ID}`, { cache: 'no-store' });
      if (!res.ok) return;
      setGrid((await res.json()) as SeatGridResp);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshGrid();
    const t = setInterval(refreshGrid, 5000);
    return () => clearInterval(t);
  }, [refreshGrid]);

  const coaches = useMemo(() => {
    if (!grid) return [];
    const byCoach = new Map<string, SeatInfo[]>();
    for (const s of grid.seats) {
      if (!byCoach.has(s.coach)) byCoach.set(s.coach, []);
      byCoach.get(s.coach)!.push(s);
    }
    return [...byCoach.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [grid]);

  const openBooking = (seat: SeatInfo) => {
    if (seat.status !== 'AVAILABLE') return;
    setSelectedSeatId(seat.id);
    setDialogOpen(true);
    setOutcome({ kind: 'idle' });
  };

  const submit = async () => {
    if (!selectedSeatId || !passengerName.trim()) return;
    setSubmitting(true);
    try {
      const key = crypto.randomUUID();
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          trainId: TRAIN_ID,
          passengerName: passengerName.trim(),
          passengerPhone: passengerPhone.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        jobId?: string;
        error?: { code: string; message: string };
      };
      const errorCode = body.error?.code ?? `http_${res.status}`;
      if (res.status === 202 && body.jobId) {
        setOutcome({ kind: 'polling', jobId: body.jobId, attempt: 0 });
      } else {
        setOutcome({ kind: 'failure', reason: errorCode });
      }
    } catch (e) {
      setOutcome({ kind: 'failure', reason: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Poll when in polling state.
  useEffect(() => {
    if (outcome.kind !== 'polling') return;
    if (outcome.attempt >= POLL_MAX) {
      setOutcome({ kind: 'failure', reason: 'Timed out waiting for worker.', jobId: outcome.jobId });
      return;
    }
    const jobId = outcome.jobId;
    const attempt = outcome.attempt;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/book/${jobId}`, { cache: 'no-store' });
        const body = (await res.json()) as BookingPollResp;
        if (body.status === 'CONFIRMED' && body.seatId) {
          setOutcome({ kind: 'success', seatId: body.seatId, jobId });
          void refreshGrid();
        } else if (body.status === 'FAILED' || body.status === 'EXPIRED') {
          setOutcome({ kind: 'failure', reason: body.failureReason ?? body.status, jobId });
          void refreshGrid();
        } else {
          setOutcome({ kind: 'polling', jobId, attempt: attempt + 1 });
        }
      } catch {
        setOutcome({ kind: 'polling', jobId, attempt: attempt + 1 });
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [outcome, refreshGrid]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-mono text-sm text-muted-foreground hover:text-foreground">
            ← Trains and Tracks
          </Link>
          <Button variant="ghost" size="sm" onClick={refreshGrid} className="gap-2">
            <RefreshCw className="h-4 w-4" /> refresh
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-xs text-muted-foreground">TRAIN 12951</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Mumbai Rajdhani Express</h1>
            <div className="mt-1 text-sm text-muted-foreground">New Delhi → Mumbai Central · 16:35 departure · ₹1,260</div>
          </div>
          {grid && (
            <div className="flex gap-2 text-xs">
              <Badge variant="secondary" className="font-mono">{grid.available} available</Badge>
              <Badge variant="secondary" className="font-mono">{grid.reserved} held</Badge>
              <Badge variant="secondary" className="font-mono">{grid.confirmed} booked</Badge>
            </div>
          )}
        </div>

        {!grid && (
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading inventory…
          </div>
        )}

        {grid && grid.available === 0 && (
          <div className="mt-16 flex flex-col items-center gap-4 rounded-xl border border-zinc-700/50 bg-zinc-900/40 py-16 text-center">
            <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
              sold out
            </div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-300">
              All 500 seats booked
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Mumbai Rajdhani 12951 for tomorrow&apos;s departure is fully confirmed. Try
              resetting the demo from <Link href="/ops" className="underline">/ops</Link> or wait
              for the sweeper to release abandoned holds.
            </p>
          </div>
        )}
        {grid && grid.available > 0 && (
          <div className="mt-10 space-y-2.5">
            {coaches.map(([coach, seats]) => (
              <div key={coach} className="flex items-center gap-4">
                <div className="w-10 shrink-0 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {coach}
                </div>
                <div className="flex flex-wrap gap-1">
                  {seats.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => openBooking(s)}
                      disabled={s.status !== 'AVAILABLE'}
                      title={`${s.id} · ${s.status}`}
                      className={`h-6 w-6 shrink-0 rounded-[5px] border text-[9px] font-mono leading-none transition-all duration-150 flex items-center justify-center ${statusColor(
                        s.status,
                        s.id === selectedSeatId,
                      )}`}
                    >
                      {s.seatNumber}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40" /> available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/40" /> held
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-destructive/40" /> booked
          </span>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-mono text-xl tracking-tight">
                {selectedSeatId ?? 'Book seat'}
              </DialogTitle>
              <div className="font-mono text-lg text-[#00D084]">₹1,260</div>
            </div>
            <DialogDescription className="text-xs">
              Allocation is first-available per SKIP LOCKED. You&apos;ll get this seat or a distinct
              available one — never a duplicate, never a hang.
            </DialogDescription>
          </DialogHeader>

          {outcome.kind === 'idle' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
                  Passenger name
                </Label>
                <Input id="name" value={passengerName} onChange={(e) => setPassengerName(e.target.value)} placeholder="Rahul Sharma" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
                  Phone (optional)
                </Label>
                <Input id="phone" value={passengerPhone} onChange={(e) => setPassengerPhone(e.target.value)} placeholder="+919876543210" />
              </div>
            </div>
          )}

          {outcome.kind === 'polling' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="relative inline-flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00D084] opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#00D084]" />
              </div>
              <div className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
                Reserving seat…
              </div>
              <div className="font-mono text-[10px] text-muted-foreground/70">
                attempt {outcome.attempt + 1}/{POLL_MAX}
              </div>
            </div>
          )}

          {outcome.kind === 'success' && (
            <div className="relative overflow-hidden rounded-lg border border-[#00D084]/40 bg-[#00D084]/[0.06] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-[#00D084]/80">
                    Confirmed
                  </div>
                  <div className="mt-1 font-mono text-3xl tracking-tight text-[#00D084]">
                    {outcome.seatId}
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <div>Passenger</div>
                  <div className="mt-0.5 text-sm normal-case tracking-normal text-foreground">
                    {passengerName}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-[#00D084]/20 pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <div>
                  <div>Booking ID</div>
                  <div className="mt-0.5 truncate text-[11px] normal-case tracking-normal text-foreground/80">
                    {outcome.jobId}
                  </div>
                </div>
                <div className="text-right">
                  <div>Amount</div>
                  <div className="mt-0.5 text-sm normal-case tracking-normal text-foreground">
                    ₹1,260
                  </div>
                </div>
              </div>
            </div>
          )}

          {outcome.kind === 'failure' && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                Booking failed
              </div>
              <div className="mt-2 text-sm">{friendlyReason(outcome.reason)}</div>
              {outcome.jobId && (
                <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Job ID
                  <span className="ml-2 text-[11px] normal-case tracking-normal text-foreground/80">
                    {outcome.jobId}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {outcome.kind === 'idle' && (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={submit}
                  disabled={submitting || !passengerName.trim()}
                  className="bg-[#00D084] text-black hover:bg-[#00D084]/90 font-mono text-[13px] uppercase tracking-wider px-5"
                >
                  {submitting ? 'Submitting…' : 'Book Now'}
                </Button>
              </>
            )}
            {outcome.kind === 'success' && (
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  setSelectedSeatId(null);
                  setPassengerName('');
                  setPassengerPhone('');
                  setOutcome({ kind: 'idle' });
                }}
                className="font-mono text-[13px] uppercase tracking-wider"
              >
                Done
              </Button>
            )}
            {outcome.kind === 'failure' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setSelectedSeatId(null);
                    setOutcome({ kind: 'idle' });
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setDialogOpen(false);
                    setSelectedSeatId(null);
                    setOutcome({ kind: 'idle' });
                    void refreshGrid();
                  }}
                  className="font-mono text-[13px] uppercase tracking-wider"
                >
                  Try Another Seat
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
