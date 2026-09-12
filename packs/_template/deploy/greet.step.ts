"use step";
/**
 * Deploy wiring ONLY (D01 §5). The declared EMPTY_NAME error is reported —
 * never thrown across the boundary — so the kernel wraps it into a failed
 * envelope with the declared taxonomy attached.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_greet: {
  isEmptyName(name: unknown): boolean;
  composeGreeting(greeting: string, name: string): string;
};

export async function execute(
  input: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<StepOutcome<{ message: string }>> {
  const shared = __superrShared_greet;
  if (shared.isEmptyName(input.name)) {
    return {
      ok: false,
      error: { code: 'EMPTY_NAME', message: 'name must be a non-empty string' },
    };
  }
  const greeting = typeof config.greeting === 'string' ? config.greeting : 'Hello';
  return {
    ok: true,
    ports: { message: shared.composeGreeting(greeting, String(input.name)) },
  };
}
