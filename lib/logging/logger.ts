// pino JSON to stdout. NO transports — Vercel breaks on `thread-stream` (ADR-015).
// Vercel ingests stdout JSON into Grafana Loki automatically.

import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'trains-and-tracks' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
