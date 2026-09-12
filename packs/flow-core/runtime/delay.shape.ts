/**
 * Pure shaping logic for `delay` (§4.2). Dependency-free by contract —
 * bundled into a hermetic IIFE embed; deterministic given its inputs, so the
 * CI oracle evaluates it with a pinned `now`.
 */

export interface DelayConfigInput {
  mode?: unknown;
  durationMs?: unknown;
  until?: unknown;
}

/** Typed reasons behind every INVALID_DELAY_CONFIG failure. */
export type DelayPlanFailureReason =
  | 'invalid_mode'
  | 'missing_duration'
  | 'bad_duration'
  | 'missing_until'
  | 'bad_until';

export type DelayPlan =
  | { ok: true; resumeAtMs: number }
  | { ok: false; reason: DelayPlanFailureReason };

/**
 * Compute the resume instant from the node config.
 *
 *  - `mode:"duration"` — `durationMs` must be a finite number ≥ 0; the
 *    workflow resumes at `now + durationMs`.
 *  - `mode:"until"` — `until` is an ISO string (or epoch-ms number); an
 *    instant in the past resumes immediately, never errors.
 */
export function planDelay(config: DelayConfigInput, nowMs: number): DelayPlan {
  const { mode } = config;
  if (mode === 'duration') {
    const duration = config.durationMs;
    if (duration === undefined || duration === null) return { ok: false, reason: 'missing_duration' };
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
      return { ok: false, reason: 'bad_duration' };
    }
    return { ok: true, resumeAtMs: nowMs + duration };
  }
  if (mode === 'until') {
    const until = config.until;
    if (until === undefined || until === null || until === '') return { ok: false, reason: 'missing_until' };
    if (typeof until === 'number' && Number.isFinite(until)) {
      return { ok: true, resumeAtMs: until };
    }
    if (typeof until === 'string') {
      const parsed = Date.parse(until);
      if (Number.isNaN(parsed)) return { ok: false, reason: 'bad_until' };
      return { ok: true, resumeAtMs: parsed };
    }
    return { ok: false, reason: 'bad_until' };
  }
  return { ok: false, reason: 'invalid_mode' };
}

/** ISO rendering of a resume instant (standard builtin only — embed-safe). */
export function isoResumeAt(resumeAtMs: number): string {
  return new Date(resumeAtMs).toISOString();
}
