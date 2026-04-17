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
      if (res.status === 202 && body.jobId) {
        setOutcome({ kind: 'polling', jobId: body.jobId, attempt: 0 });
      } else if (res.status === 429) {
        setOutcome({ kind: 'failure', reason: 'Rate limited — try again shortly.' });
      } else if (res.status === 503) {
        setOutcome({ kind: 'failure', reason: 'Queue saturated — try again shortly.' });
      } else if (res.status === 502) {
        setOutcome({ kind: 'failure', reason: 'Could not enqueue booking (publish failed). Retry with a fresh key.' });
      } else {
        setOutcome({
          kind: 'failure',
          reason: body.error?.message ?? `HTTP ${res.status}`,
        });
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

        {grid && (
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedSeatId ?? 'Book seat'}</DialogTitle>
            <DialogDescription>
              Ticket ₹1,260. Allocation is first-available per our SKIP LOCKED primitive — you may
              not get this exact seat if someone else beats you, but you&apos;ll get a distinct one
              or an honest failure.
            </DialogDescription>
          </DialogHeader>

          {outcome.kind === 'idle' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Passenger name</Label>
                <Input id="name" value={passengerName} onChange={(e) => setPassengerName(e.target.value)} placeholder="Rahul Sharma" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" value={passengerPhone} onChange={(e) => setPassengerPhone(e.target.value)} placeholder="+919876543210" />
              </div>
            </div>
          )}

          {outcome.kind === 'polling' && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Worker processing… attempt {outcome.attempt + 1}/{POLL_MAX}
            </div>
          )}

          {outcome.kind === 'success' && (
            <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm">
              <div className="font-mono text-base text-emerald-400">Booked · {outcome.seatId}</div>
              <div className="mt-1 text-muted-foreground">Job {outcome.jobId}</div>
            </div>
          )}

          {outcome.kind === 'failure' && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <div className="font-mono text-destructive">Booking failed</div>
              <div className="mt-1 text-muted-foreground">{outcome.reason}</div>
              {outcome.jobId && (
                <div className="mt-1 font-mono text-xs text-muted-foreground">Job {outcome.jobId}</div>
              )}
            </div>
          )}

          <DialogFooter>
            {outcome.kind === 'idle' && (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={submitting || !passengerName.trim()}>
                  {submitting ? 'Submitting…' : 'Book seat · ₹1,260'}
                </Button>
              </>
            )}
            {(outcome.kind === 'success' || outcome.kind === 'failure') && (
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  setSelectedSeatId(null);
                  setPassengerName('');
                  setPassengerPhone('');
                  setOutcome({ kind: 'idle' });
                }}
              >
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
