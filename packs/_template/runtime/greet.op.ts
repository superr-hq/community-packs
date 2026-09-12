/**
 * Local execution for `greet` (§4.2 runtime module contract, D01 §4).
 * Declared errors are thrown as typed error objects — the kernel's wrap-all
 * semantics (§5.9) normalize them; `EMPTY_NAME` is declared in pack.json so
 * it passes the taxonomy gate.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { composeGreeting, isEmptyName } from './greet.shape.js';

/** Declared in pack.json (`errors[0]`) — severity warn, non-retryable. */
export class EmptyNameError extends Error {
  readonly code = 'EMPTY_NAME';
  readonly severity = 'warn' as const;
  readonly retryable = false as const;

  constructor() {
    super('name must be a non-empty string');
    this.name = 'EmptyNameError';
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ message: string }>> {
  const name = ctx.inputs.name;
  if (isEmptyName(name)) throw new EmptyNameError();
  const greeting =
    typeof ctx.config.greeting === 'string' ? ctx.config.greeting : 'Hello';
  return ctx.ok({ message: composeGreeting(greeting, String(name)) });
}
