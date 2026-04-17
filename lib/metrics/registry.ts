// Phase 2 stub: name-only metric recorder. Full prom-client registry +
// remote_write push pipeline lands in Phase 5. Handlers can call
// `record.counter('x')` / `record.observe('y', ms)` without crashing and
// the calls become real pushes once the registry is wired.

import { logger } from '@/lib/logging/logger';

type Labels = Record<string, string | number | undefined>;

function stringify(labels: Labels | undefined): string {
  if (!labels) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(labels)) {
    if (v === undefined) continue;
    parts.push(`${k}=${String(v)}`);
  }
  return parts.join(',');
}

export const record = {
  counter(name: string, labels?: Labels): void {
    logger.debug({ metric: name, labels: stringify(labels), op: 'inc' }, 'metric');
  },
  observe(name: string, value: number, labels?: Labels): void {
    logger.debug({ metric: name, value, labels: stringify(labels), op: 'obs' }, 'metric');
  },
  gauge(name: string, value: number, labels?: Labels): void {
    logger.debug({ metric: name, value, labels: stringify(labels), op: 'set' }, 'metric');
  },
};
