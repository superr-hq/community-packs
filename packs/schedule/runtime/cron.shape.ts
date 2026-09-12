/**
 * Pure shaping logic for `cron` (§4.2: the mandatory parity source).
 * Dependency-free by contract — bundled into a hermetic IIFE embed.
 *
 * Structural cron validation only (five fields over the standard charset):
 * semantic scheduling math belongs to the clock surface that fires the run,
 * never to pack code. The node's runtime verdict is a passthrough that pins
 * the fire instant to a parseable ISO string.
 */

export interface CronCheck {
  ok: boolean;
  reason?: 'empty' | 'field_count' | 'bad_field';
  field?: number;
}

/** One cron field: numbers, names, lists, ranges, steps. */
const FIELD_RE = /^[\dA-Za-z*,/-]+$/;

/** Structural five-field cron validation — total, deterministic, embed-safe. */
export function validateCron(expression: unknown): CronCheck {
  if (typeof expression !== 'string' || expression.trim() === '') {
    return { ok: false, reason: 'empty' };
  }
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { ok: false, reason: 'field_count', field: fields.length };
  }
  for (const [index, field] of fields.entries()) {
    if (!FIELD_RE.test(field)) {
      return { ok: false, reason: 'bad_field', field: index + 1 };
    }
  }
  return { ok: true };
}

export interface ScheduledAtCheck {
  ok: boolean;
  reason?: 'missing' | 'not_iso';
}

/**
 * Validate the delivered fire instant and render it as canonical ISO.
 * Epoch-ms numbers are tolerated as input; the port is always ISO.
 */
export function checkScheduledAt(value: unknown): { ok: true; iso: string } | { ok: false; reason: 'missing' | 'not_iso' } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, reason: 'missing' };
  }
  let ms: number;
  if (typeof value === 'number' && Number.isFinite(value)) {
    ms = value;
  } else if (typeof value === 'string') {
    ms = Date.parse(value);
    if (Number.isNaN(ms)) return { ok: false, reason: 'not_iso' };
  } else {
    return { ok: false, reason: 'not_iso' };
  }
  try {
    return { ok: true, iso: new Date(ms).toISOString() };
  } catch {
    // Out-of-range instants throw RangeError rather than producing junk.
    return { ok: false, reason: 'not_iso' };
  }
}
