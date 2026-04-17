// Structured error response matching API_CONTRACT §2:
//   { error: { code, message, details?, request_id } }
// Helper also composes X-Request-ID + any extra headers (Retry-After, etc.).

import { NextResponse } from 'next/server';

export type ErrorCode =
  | 'invalid_request_body'
  | 'idempotency_key_missing'
  | 'idempotency_key_malformed'
  | 'idempotency_key_in_use'
  | 'idempotency_key_replaying'
  | 'rate_limit_exceeded'
  | 'backpressure'
  | 'circuit_open'
  | 'upstream_failure'
  | 'internal_error'
  | 'invalid_qstash_signature'
  | 'admin_unauthorized'
  | 'job_not_found'
  | 'sold_out'
  | 'hold_expired'
  | 'payment_failed'
  | 'simulator_busy';

export interface ApiErrorInit {
  code: ErrorCode;
  message: string;
  status: number;
  requestId: string;
  details?: unknown;
  extraHeaders?: Record<string, string>;
}

export function apiError(init: ApiErrorInit): NextResponse {
  const body = {
    error: {
      code: init.code,
      message: init.message,
      details: init.details,
      request_id: init.requestId,
    },
  };
  return NextResponse.json(body, {
    status: init.status,
    headers: {
      'X-Request-ID': init.requestId,
      ...(init.extraHeaders ?? {}),
    },
  });
}
