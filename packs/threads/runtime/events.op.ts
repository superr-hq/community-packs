/**
 * Local execution for the `events` trigger (§4.2 runtime module contract).
 *
 * In production, ingress has already authenticated and routed the delivery;
 * this op re-derives the same verdict from the raw delivery so fixtures pin
 * exactly what a subscribed threads event looks like on the envelope.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { shapeDelivery, subscribedTypesOf } from './events.shape.js';

/** Declared in pack.json (`errors[0]`) — severity error, non-retryable. */
export class MalformedEventError extends Error {
  readonly code = 'MALFORMED_EVENT';
  readonly severity = 'error' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown>;

  constructor(reason: string) {
    super('delivery is not a well-formed social event');
    this.name = 'MalformedEventError';
    this.details = { reason };
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ event: unknown }>> {
  const verdict = shapeDelivery(
    ctx.delivery as Parameters<typeof shapeDelivery>[0],
    subscribedTypesOf(ctx.config),
  );
  // Skipped envelopes carry null ports keyed by the DECLARED schema (§4.4) —
  // the kernel assembles them at envelope level, so the op-side widening is
  // an intentional double assertion.
  if (verdict.kind === 'skip') {
    return ctx.skip(verdict.skipCode) as unknown as StepResult<{ event: unknown }>;
  }
  if (verdict.kind === 'fail') throw new MalformedEventError(verdict.reason);
  return ctx.ok({ event: verdict.event });
}
