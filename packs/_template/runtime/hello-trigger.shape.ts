/**
 * Pure shaping logic for `hello-trigger` (§4.2: the mandatory parity source).
 *
 * MUST stay dependency-free — this module is bundled into a hermetic
 * browser-platform IIFE embed by `superr pack build`; any import fails the
 * build. Everything here is deterministic so the CI oracle can evaluate it.
 */

/** Raw delivery payload as received from ingress (unvalidated on purpose). */
export interface HelloDelivery {
  name?: unknown;
}

/**
 * Pick the name a greeting uses: the delivery's `name` when it is a
 * non-blank string, else the configured fallback.
 */
export function pickName(
  delivery: HelloDelivery | null | undefined,
  fallback: string,
): string {
  const name = delivery?.name;
  return typeof name === 'string' && name.trim() !== '' ? name : fallback;
}

/** Shape the output port value deterministically. */
export function shapeGreeting(name: string): string {
  return `Hello, ${name}!`;
}
