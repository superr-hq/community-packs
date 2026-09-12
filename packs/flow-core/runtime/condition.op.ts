/**
 * Local execution for `condition` (§4.2 runtime module contract, D01 §4).
 *
 * The verdict's `branch` port drives the kernel's guard semantics: control
 * edges leaving this instance carry sourcePort "true"|"false" and only the
 * matching edge stays active (§5.2, `controlEdgeActive`).
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import {
  branchLabel,
  evaluateCondition,
  type ConditionOperator,
} from './condition.shape.js';

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ branch: string; matched: boolean }>> {
  const operator = (ctx.config.operator as ConditionOperator | undefined) ?? undefined;
  const compareTo = (ctx.config as { compareTo?: unknown }).compareTo;
  const matched = evaluateCondition(ctx.inputs.value, operator, compareTo);
  return ctx.ok({ branch: branchLabel(matched), matched });
}
