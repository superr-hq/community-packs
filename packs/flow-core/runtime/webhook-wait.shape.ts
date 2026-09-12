/**
 * Pure shaping logic for `webhook-wait` (§4.2: the mandatory parity source).
 * Dependency-free by contract — bundled into a hermetic IIFE embed.
 *
 * Shapes the resume delivery (inbound HTTP callback) into the output envelope:
 *   - `body`: parsed payload (or raw payload if non-JSON)
 *   - `headers`: record of header string values
 *   - `query`: record of query string values
 *   - `method`: HTTP verb (defaults to POST)
 *
 * Also detects timeout/expired deliveries and reports WEBHOOK_WAIT_TIMEOUT.
 */

export interface WebhookWaitDelivery {
  body?: unknown;
  rawBody?: unknown;
  headers?: unknown;
  query?: unknown;
  method?: unknown;
  expired?: unknown;
  reason?: unknown;
  expiredAt?: unknown;
  [key: string]: unknown;
}

export interface WebhookWaitOutput {
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  method: string;
  [key: string]: unknown;
}

export type WebhookWaitErrorCode = 'WEBHOOK_WAIT_TIMEOUT';

export type ParsedWebhookWaitDelivery =
  | {
      ok: true;
      output: WebhookWaitOutput;
    }
  | {
      ok: false;
      code: WebhookWaitErrorCode;
      reason: string;
      details: Record<string, unknown>;
    };

/**
 * Check if the execution argument is a resume delivery.
 */
export function isResumeDelivery(arg: unknown): boolean {
  if (arg === null || arg === undefined || typeof arg !== 'object') {
    return false;
  }
  const record = arg as Record<string, unknown>;
  return (
    'body' in record ||
    'rawBody' in record ||
    'headers' in record ||
    'query' in record ||
    'method' in record ||
    'expired' in record ||
    'reason' in record
  );
}

/**
 * Pure normalization of incoming callback delivery into structured output ports.
 */
export function normalizeWebhookDelivery(
  delivery: unknown,
  config?: Record<string, unknown>,
): ParsedWebhookWaitDelivery {
  if (delivery === null || delivery === undefined || typeof delivery !== 'object') {
    return {
      ok: true,
      output: {
        body: {},
        headers: {},
        query: {},
        method: 'POST',
      },
    };
  }

  const record = delivery as Record<string, unknown>;

  // Check for expired delivery signal
  if (
    record.expired === true ||
    record.reason === 'timeout' ||
    record.reason === 'expired' ||
    record.status === 'expired'
  ) {
    const expiredAt =
      typeof record.expiredAt === 'string'
        ? record.expiredAt
        : new Date().toISOString();
    const timeoutMs =
      typeof config?.timeoutMs === 'number' && Number.isFinite(config.timeoutMs)
        ? config.timeoutMs
        : undefined;

    return {
      ok: false,
      code: 'WEBHOOK_WAIT_TIMEOUT',
      reason: 'The webhook wait hook exceeded its configured timeoutMs before an HTTP callback was received.',
      details: {
        reason: typeof record.reason === 'string' ? record.reason : 'timeout_expired',
        expiredAt,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      },
    };
  }

  // Normalize body
  let body: unknown;
  if ('body' in record && record.body !== undefined) {
    body = record.body;
  } else if ('rawBody' in record && record.rawBody !== undefined) {
    if (typeof record.rawBody === 'string') {
      try {
        body = JSON.parse(record.rawBody);
      } catch {
        body = record.rawBody;
      }
    } else {
      body = record.rawBody;
    }
  } else {
    body = {};
  }

  // Normalize headers to Record<string, string>
  const headers: Record<string, string> = {};
  if (
    typeof record.headers === 'object' &&
    record.headers !== null &&
    !Array.isArray(record.headers)
  ) {
    for (const [k, v] of Object.entries(record.headers as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        headers[k.toLowerCase()] = typeof v === 'string' ? v : String(v);
      }
    }
  }

  // Normalize query to Record<string, string>
  const query: Record<string, string> = {};
  if (
    typeof record.query === 'object' &&
    record.query !== null &&
    !Array.isArray(record.query)
  ) {
    for (const [k, v] of Object.entries(record.query as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        query[k] = typeof v === 'string' ? v : String(v);
      }
    }
  }

  // Normalize method
  let method = 'POST';
  if (typeof record.method === 'string' && record.method.trim() !== '') {
    method = record.method.trim().toUpperCase();
  }

  return {
    ok: true,
    output: {
      body,
      headers,
      query,
      method,
    },
  };
}

/**
 * Expiry instant for the configured timeout window, from a pinned `now`.
 * Absent or invalid config => undefined (waits indefinitely).
 */
export function expiryIso(timeoutMs: unknown, nowMs: number): string | undefined {
  if (timeoutMs === undefined || timeoutMs === null) return undefined;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }
  return new Date(nowMs + timeoutMs).toISOString();
}
