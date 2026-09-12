/**
 * Local execution for `webhook-http` (§4.2 runtime module contract, D01 §4).
 *
 * The CI oracle executes the BUNDLE; this op documents local semantics and
 * runs under the runtime host from P3.6. In production the ingress pipeline
 * has already authenticated and normalized the delivery BEFORE a run starts
 * — this node re-derives the same verdict from the raw delivery so fixture
 * corpora pin exactly what ingress accepts.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { parseBody, type HttpDelivery } from './webhook-http.shape.js';

/** Declared in pack.json (`errors[0]`) — severity error, non-retryable. */
export class MalformedJsonError extends Error {
  readonly code = 'MALFORMED_JSON';
  readonly severity = 'error' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown>;

  constructor(reason: string) {
    super('request body is not valid JSON');
    this.name = 'MalformedJsonError';
    this.details = { reason };
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ body: unknown }>> {
  const parsed = parseBody(ctx.delivery as HttpDelivery | undefined);
  if (!parsed.ok) throw new MalformedJsonError(parsed.reason);
  return ctx.ok({ body: parsed.body });
}
