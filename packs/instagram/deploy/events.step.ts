"use step";
/**
 * Deploy wiring ONLY (D01 §5) for the `events` trigger: run the raw delivery
 * through the embedded gate chain and report the verdict. Signature
 * verification and routing are kernel/adapter mechanics upstream.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_events: {
  EVENT_TYPES: readonly string[];
  shapeDelivery(
    delivery: { rawBody?: unknown } | null | undefined,
    subscribedTypes: readonly unknown[],
  ):
    | { kind: 'ok'; event: Record<string, unknown> }
    | { kind: 'skip'; skipCode: string }
    | { kind: 'fail'; code: string; reason: string };
  subscribedTypesOf(config: Record<string, unknown>): string[];
};

export async function execute(
  delivery: { rawBody?: unknown },
  config: Record<string, unknown>,
): Promise<StepOutcome<{ event: Record<string, unknown> }>> {
  const shared = __superrShared_events;
  const verdict = shared.shapeDelivery(delivery, shared.subscribedTypesOf(config));
  if (verdict.kind === 'skip') {
    return { ok: false, skipCode: verdict.skipCode };
  }
  if (verdict.kind === 'fail') {
    return {
      ok: false,
      error: {
        code: verdict.code,
        message: 'delivery is not a well-formed social event',
        details: { reason: verdict.reason },
      },
    };
  }
  return { ok: true, ports: { event: verdict.event } };
}
