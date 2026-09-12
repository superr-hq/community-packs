/**
 * Local execution for `webhook-wait` (§4.2 runtime module contract, D01 §4).
 *
 * Hook semantics (D02 §5): the compiled HOOK primitive suspends the run and
 * this node's output materializes when an external HTTP callback arrives
 * through the ingress route for this hook instance.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import {
  normalizeWebhookDelivery,
  type WebhookWaitErrorCode,
  type WebhookWaitOutput,
} from './webhook-wait.shape.js';

export class WebhookWaitError extends Error {
  readonly code: WebhookWaitErrorCode;
  readonly severity: 'warn' | 'error';
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(info: {
    code: WebhookWaitErrorCode;
    message: string;
    severity?: 'warn' | 'error';
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(info.message);
    this.name = 'WebhookWaitError';
    this.code = info.code;
    this.severity = info.severity ?? 'error';
    this.retryable = info.retryable ?? false;
    this.details = info.details ?? {};
  }
}

/** Declared in pack.json — severity error, non-retryable. */
export class WebhookWaitTimeoutError extends WebhookWaitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'WEBHOOK_WAIT_TIMEOUT',
      message: message || 'The webhook wait hook exceeded its configured timeoutMs before an HTTP callback was received.',
      severity: 'error',
      retryable: false,
      details: details ?? {},
    });
    this.name = 'WebhookWaitTimeoutError';
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<WebhookWaitOutput>> {
  const config = (ctx.config ?? {}) as Record<string, unknown>;
  const parsed = normalizeWebhookDelivery(ctx.delivery, config);

  if (!parsed.ok) {
    if (parsed.code === 'WEBHOOK_WAIT_TIMEOUT') {
      throw new WebhookWaitTimeoutError(parsed.reason, parsed.details);
    }
    throw new WebhookWaitError({
      code: parsed.code,
      message: parsed.reason,
      details: parsed.details,
    });
  }

  return ctx.ok(parsed.output);
}
