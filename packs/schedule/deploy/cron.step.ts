"use step";
/**
 * Deploy wiring ONLY (D01 §5): validate the declared cron expression and the
 * delivered fire time through embedded pure functions, then report the
 * verdict. Scheduling math lives with the clock surface — none here.
 */

import type { StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_cron: {
  validateCron(expression: unknown):
    | { ok: boolean; reason?: string; field?: number };
  checkScheduledAt(value: unknown):
    | { ok: true; iso: string }
    | { ok: false; reason: 'missing' | 'not_iso' };
};

export async function execute(
  delivery: { scheduledAt?: unknown },
  config: Record<string, unknown>,
): Promise<StepOutcome<{ scheduledAt: string }>> {
  const shared = __superrShared_cron;
  const cron = shared.validateCron(config.cron);
  if (!cron.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_CRON',
        message: 'cron expression is not a five-field expression',
        details: { reason: cron.reason, ...(cron.field === undefined ? {} : { field: cron.field }) },
      },
    };
  }
  const checked = shared.checkScheduledAt(delivery.scheduledAt);
  if (!checked.ok) {
    return {
      ok: false,
      error: {
        code: 'BAD_SCHEDULED_AT',
        message: 'delivered fire time is not a usable instant',
        details: { reason: checked.reason },
      },
    };
  }
  return { ok: true, ports: { scheduledAt: checked.iso } };
}
