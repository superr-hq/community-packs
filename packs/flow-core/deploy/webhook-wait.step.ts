"use step";
/**
 * Deploy wiring ONLY (D01 §5) for the webhook-wait hook pattern:
 * Normalizes incoming HTTP callback deliveries through the embedded pure functions.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_webhook_wait: {
  normalizeWebhookDelivery(
    delivery: unknown,
    config?: Record<string, unknown>,
  ):
    | {
        ok: true;
        output: {
          body: unknown;
          headers: Record<string, string>;
          query: Record<string, string>;
          method: string;
        };
      }
    | {
        ok: false;
        code: 'WEBHOOK_WAIT_TIMEOUT';
        reason: string;
        details: Record<string, unknown>;
      };
};

type WebhookWaitOutcome = StepOutcome<{
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  method: string;
}>;

export async function execute(
  delivery: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<WebhookWaitOutcome> {
  const shared = __superrShared_webhook_wait;
  const parsed = shared.normalizeWebhookDelivery(delivery, config);

  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: parsed.code,
        message: parsed.reason,
        details: parsed.details,
      },
    };
  }

  return {
    ok: true,
    ports: parsed.output,
  };
}
