/**
 * Local execution for `invoke` (§4.2 runtime module contract, D01 §4).
 *
 * A manual run reaches this node as a seeded RunRequest whose envelope
 * already carries the payload port (uniformity with every other trigger,
 * ARCHITECTURE §17.3); the step re-derives the same verdict from the raw
 * invocation so fixtures pin exactly what a manual fire accepts.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { extractPayload, type InvokeDelivery } from './invoke.shape.js';

/** Declared in pack.json (`errors[0]`) — severity error, non-retryable. */
export class PayloadRequiredError extends Error {
  readonly code = 'PAYLOAD_REQUIRED';
  readonly severity = 'error' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown> = {};

  constructor() {
    super('manual fire provided no payload');
    this.name = 'PayloadRequiredError';
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ payload: unknown }>> {
  const extracted = extractPayload(ctx.delivery as InvokeDelivery | undefined);
  if (!extracted.ok) throw new PayloadRequiredError();
  return ctx.ok({ payload: extracted.payload });
}
