/**
 * Local execution for `delay` (§4.2 runtime module contract, D01 §4).
 *
 * The step itself computes the resume instant only; the actual sleeping is
 * the kernel's DELAY pattern (§5.8): the P3 compiler emits a durable
 * wake-at primitive from this node's kind, so no pack code ever blocks.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { isoResumeAt, planDelay, type DelayConfigInput } from './delay.shape.js';

/** Declared in pack.json (`errors[0]`) — severity error, non-retryable. */
export class InvalidDelayConfigError extends Error {
  readonly code = 'INVALID_DELAY_CONFIG';
  readonly severity = 'error' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown>;

  constructor(reason: string) {
    super(`delay config is not executable (${reason})`);
    this.name = 'InvalidDelayConfigError';
    this.details = { reason };
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ resumeAt: string }>> {
  const nowMs = Date.now();
  const plan = planDelay(ctx.config as DelayConfigInput, nowMs);
  if (!plan.ok) throw new InvalidDelayConfigError(plan.reason);
  return ctx.ok({ resumeAt: isoResumeAt(plan.resumeAtMs) });
}
