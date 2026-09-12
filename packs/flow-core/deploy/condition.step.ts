"use step";
/**
 * Deploy wiring ONLY (D01 §5): evaluate the condition through the embedded
 * pure function and report the branch verdict. Edge guards read the `branch`
 * port; the boolean `matched` is provenance for the timeline.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_condition: {
  evaluateCondition(value: unknown, operator: unknown, compareTo: unknown): boolean;
  branchLabel(matched: boolean): 'true' | 'false';
};

export async function execute(
  input: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<StepOutcome<{ branch: string; matched: boolean }>> {
  const shared = __superrShared_condition;
  const matched = shared.evaluateCondition(input.value, config.operator, config.compareTo);
  return { ok: true, ports: { branch: shared.branchLabel(matched), matched } };
}
