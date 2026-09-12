"use step";
/**
 * Deploy wiring ONLY (D01 §5): presence-check the payload via the embedded
 * pure function and report the verdict.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_invoke: {
  extractPayload(delivery: { payload?: unknown } | null | undefined):
    | { ok: true; payload: unknown }
    | { ok: false; reason: string };
};

export async function execute(
  delivery: { payload?: unknown },
): Promise<StepOutcome<{ payload: unknown }>> {
  const shared = __superrShared_invoke;
  const extracted = shared.extractPayload(delivery);
  if (!extracted.ok) {
    return {
      ok: false,
      error: {
        code: 'PAYLOAD_REQUIRED',
        message: 'manual fire provided no payload',
        details: {},
      },
    };
  }
  return { ok: true, ports: { payload: extracted.payload } };
}
