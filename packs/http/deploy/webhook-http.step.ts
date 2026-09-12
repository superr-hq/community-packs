"use step";
/**
 * Deploy wiring ONLY (D01 §5): parse the raw delivery through the embedded
 * pure function and report the verdict. Route claims, authn, and dispatch
 * are kernel ingress mechanics — none of them live here.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_webhook_http: {
  parseBody(delivery: { rawBody?: unknown } | null | undefined):
    | { ok: true; body: unknown }
    | { ok: false; reason: string };
};

export async function execute(
  delivery: { rawBody?: unknown },
): Promise<StepOutcome<{ body: unknown }>> {
  const shared = __superrShared_webhook_http;
  const parsed = shared.parseBody(delivery);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'MALFORMED_JSON',
        message: 'request body is not valid JSON',
        details: { reason: parsed.reason },
      },
    };
  }
  return { ok: true, ports: { body: parsed.body } };
}
