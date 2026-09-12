/**
 * Pure shaping logic for `greet` (§4.2). Dependency-free by contract — see
 * `hello-trigger.shape.ts`; bundled as hermetic embeds, evaluated verbatim
 * by the CI oracle.
 */

/** A name is usable only as a non-blank string; anything else is junk input. */
export function isEmptyName(name: unknown): boolean {
  return typeof name !== 'string' || name.trim() === '';
}

/** Compose the message port value; blank greetings fall back to "Hello". */
export function composeGreeting(greeting: string, name: string): string {
  const word = greeting.trim() === '' ? 'Hello' : greeting.trim();
  return `${word}, ${name.trim()}!`;
}
