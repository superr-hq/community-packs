/**
 * Local execution for `set-state` (§4.2 runtime module contract, D01 §4).
 *
 * The CI oracle executes the BUNDLE (embeds + step wiring), not this module;
 * ops document local semantics and run under the runtime host from P3.6.
 * Only the context arrives here — no kernel imports, no global state.
 *
 * State persistence is a service: `ctx.services.state.write(record)` is the
 * single mutation port, injected by the host. The verdict echoes the record
 * so downstream nodes can reference `storedValue` without reading state.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { isValidStateKey, stateWriteRecord } from './set-state.shape.js';

/** Declared in pack.json (`errors[0]`) — severity warn, non-retryable. */
export class EmptyStateKeyError extends Error {
  readonly code = 'EMPTY_STATE_KEY';
  readonly severity = 'warn' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown>;

  constructor(key: unknown) {
    super('state key must be a non-empty slug');
    this.name = 'EmptyStateKeyError';
    this.details = { key: typeof key === 'string' ? key : String(key) };
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ stateKey: string; storedValue: unknown }>> {
  const key = ctx.config.key;
  if (!isValidStateKey(key)) throw new EmptyStateKeyError(key);
  const record = stateWriteRecord(key, ctx.inputs.value);
  await ctx.services?.state?.write(record);
  return ctx.ok({ stateKey: record.key, storedValue: record.value });
}
