/**
 * Pure shaping logic for `set-state` (§4.2: the mandatory parity source).
 * Dependency-free by contract — bundled into a hermetic browser-platform
 * IIFE embed by `superr pack build`; any import fails the build. Everything
 * here is deterministic so the CI oracle can evaluate it.
 */

/** State keys are non-empty slugs that may namespace with `.`, `_`, `/`, `-`. */
export function isValidStateKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key);
}

export interface StateWriteRecord {
  key: string;
  value: unknown;
}

/**
 * The record a set-state execution writes. Pure and total — the local op and
 * the deploy wiring both derive their verdicts from this shape, and the
 * runtime-host state port (P3.6) persists exactly this object.
 */
export function stateWriteRecord(key: string, value: unknown): StateWriteRecord {
  return { key, value };
}
