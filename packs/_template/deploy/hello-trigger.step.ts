"use step";
/**
 * Deploy wiring ONLY (D01 §5): extract from the delivery/config, call the
 * embedded pure functions, report a verdict. Embeds are injected by the
 * compiler as shared scripts bound to sanitized `__superrShared_*` symbols;
 * the `declare const`s are the type-level view of that injection contract.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_hello_trigger: {
  pickName(
    delivery: { name?: unknown } | null | undefined,
    fallback: string,
  ): string;
  shapeGreeting(name: string): string;
};

export async function execute(
  delivery: unknown,
  config: Record<string, unknown>,
): Promise<StepOutcome<{ message: string }>> {
  const shared = __superrShared_hello_trigger;
  const fallback = typeof config.name === 'string' ? config.name : 'world';
  const name = shared.pickName(
    delivery as { name?: unknown } | null | undefined,
    fallback,
  );
  return { ok: true, ports: { message: shared.shapeGreeting(name) } };
}
