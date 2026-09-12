"use step";
/**
 * Deploy wiring ONLY (D01 §5). Time enters through the host-injected
 * `__superrNow()` port (the oracle fixture harness installs the same name),
 * so resume instants stay deterministic under pinned clocks; sleeping itself
 * is the compiler's DELAY primitive, never step code.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_delay: {
  planDelay(
    config: { mode?: unknown; durationMs?: unknown; until?: unknown },
    nowMs: number,
  ):
    | { ok: true; resumeAtMs: number }
    | { ok: false; reason: string };
  isoResumeAt(resumeAtMs: number): string;
};

/** Host-injected clock port; falls back to the ambient clock when absent. */
declare const __superrNow: () => number;

export async function execute(
  _input: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<StepOutcome<{ resumeAt: string }>> {
  const shared = __superrShared_delay;
  const now =
    typeof __superrNow === 'function'
      ? __superrNow()
      : Date.now();
  const plan = shared.planDelay(
    { mode: config.mode, durationMs: config.durationMs, until: config.until },
    now,
  );
  if (!plan.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DELAY_CONFIG',
        message: `delay config is not executable (${plan.reason})`,
        details: { reason: plan.reason },
      },
    };
  }
  return { ok: true, ports: { resumeAt: shared.isoResumeAt(plan.resumeAtMs) } };
}
