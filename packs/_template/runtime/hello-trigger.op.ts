/**
 * Local execution for `hello-trigger` (§4.2 runtime module contract, D01 §4).
 *
 * The CI oracle executes the BUNDLE (embeds + step wiring), not this module;
 * ops document local semantics and run under the runtime host from P3.6.
 * Only the context arrives here — no kernel imports, no global state.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { pickName, shapeGreeting } from './hello-trigger.shape.js';

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ message: string }>> {
  const delivery = ctx.delivery as Parameters<typeof pickName>[0];
  const fallback =
    typeof ctx.config.name === 'string' ? ctx.config.name : 'world';
  return ctx.ok({ message: shapeGreeting(pickName(delivery, fallback)) });
}
