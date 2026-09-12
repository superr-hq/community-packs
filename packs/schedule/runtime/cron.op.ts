/**
 * Local execution for `cron` (§4.2 runtime module contract, D01 §4).
 *
 * The clock surface (runtime host / platform scheduler from P3.6) fires the
 * run and delivers `{scheduledAt}`; this node validates both its declared
 * expression and the delivered instant. Cron math lives with the clock.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { checkScheduledAt, validateCron } from './cron.shape.js';

/** Declared in pack.json (`errors[0]`) — severity error, non-retryable. */
export class InvalidCronError extends Error {
  readonly code = 'INVALID_CRON';
  readonly severity = 'error' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown>;

  constructor(reason: string, field?: number) {
    super('cron expression is not a five-field expression');
    this.name = 'InvalidCronError';
    this.details = { reason, ...(field === undefined ? {} : { field }) };
  }
}

/** Declared in pack.json (`errors[1]`) — severity error, non-retryable. */
export class BadScheduledAtError extends Error {
  readonly code = 'BAD_SCHEDULED_AT';
  readonly severity = 'error' as const;
  readonly retryable = false as const;
  readonly details: Record<string, unknown>;

  constructor(reason: string) {
    super('delivered fire time is not a usable instant');
    this.name = 'BadScheduledAtError';
    this.details = { reason };
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ scheduledAt: string }>> {
  const cron = validateCron(ctx.config.cron);
  if (!cron.ok) throw new InvalidCronError(cron.reason ?? 'bad_field', cron.field);
  const delivered = (ctx.delivery as { scheduledAt?: unknown } | undefined)?.scheduledAt;
  const checked = checkScheduledAt(delivered);
  if (!checked.ok) throw new BadScheduledAtError(checked.reason);
  return ctx.ok({ scheduledAt: checked.iso });
}
