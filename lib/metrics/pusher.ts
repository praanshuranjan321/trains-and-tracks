// Push the in-memory registry to Grafana Cloud Mimir via remote_write.
//
// Called at the end of each Node-runtime handler via waitUntil so the push
// (20–80ms) runs off the response critical path. On push failure we log and
// swallow — metrics degrade, app continues (PRD §5.4 reliability posture).
//
// Shape conversion: prom-client's getMetricsAsJSON() gives us
//   [{name, type, help, values: [{value, labels}]}, ...]
// for counters/gauges; histograms expand to _bucket/_count/_sum entries.
// Each (name + labels) → one timeseries entry with a single sample.

import type { MetricObjectWithValues, MetricValue } from 'prom-client';
import { pushTimeseries } from 'prometheus-remote-write';
import { after } from 'next/server';

import { registry } from './registry';
import { logger } from '@/lib/logging/logger';

interface RemoteWriteTimeseries {
  labels: Record<string, string> & { __name__: string };
  samples: { value: number; timestamp?: number }[];
}

function coerceLabels(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === undefined || val === null) continue;
    out[k] = String(val);
  }
  return out;
}

async function snapshot(): Promise<RemoteWriteTimeseries[]> {
  const metrics = await registry.getMetricsAsJSON();
  const now = Date.now();
  const out: RemoteWriteTimeseries[] = [];

  for (const m of metrics as unknown as MetricObjectWithValues<MetricValue<string>>[]) {
    if (!m.values || m.values.length === 0) continue;
    for (const v of m.values) {
      // For histograms, prom-client emits .metricName = m.name + '_bucket' etc.
      const name = (v as { metricName?: string }).metricName ?? m.name;
      out.push({
        labels: {
          __name__: name,
          ...coerceLabels(v.labels),
        },
        samples: [{ value: Number(v.value ?? 0), timestamp: now }],
      });
    }
  }
  return out;
}

let pushingInFlight = false;

/**
 * Push the current registry snapshot to Grafana Mimir.
 * Safe to call from waitUntil. Guards against concurrent pushes with a
 * module-level flag (per-instance; warm containers won't double-push).
 */
export async function flushMetrics(): Promise<void> {
  if (pushingInFlight) return;
  const url = process.env.GRAFANA_PROM_URL;
  const user = process.env.GRAFANA_PROM_USER;
  const token = process.env.GRAFANA_PROM_TOKEN;
  if (!url || !user || !token) {
    // Missing config — skip silently (dev / CI). Nothing to push.
    return;
  }

  pushingInFlight = true;
  try {
    const series = await snapshot();
    if (series.length === 0) return;

    const res = await pushTimeseries(series, {
      url,
      auth: { username: user, password: token },
      timeout: 3000,
    });
    if (res.status >= 400) {
      logger.warn(
        { status: res.status, statusText: res.statusText, errorMessage: res.errorMessage },
        'metrics_push_failed',
      );
    }
  } catch (e: unknown) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      'metrics_push_error',
    );
  } finally {
    pushingInFlight = false;
  }
}

/**
 * Schedule a metrics flush to run AFTER the current response is sent.
 * Thin wrapper over Next.js `after()` (waitUntil semantics on Vercel).
 * Call early in each Node handler so the flush runs regardless of which
 * branch returns.
 */
export function scheduleMetricsPush(): void {
  try {
    after(() => flushMetrics());
  } catch {
    // after() outside a request scope (dev/tests) — no-op. Fall back to
    // fire-and-forget so the flush at least runs in long-lived contexts.
    void flushMetrics();
  }
}
