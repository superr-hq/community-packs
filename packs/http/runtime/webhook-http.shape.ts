/**
 * Pure shaping logic for `webhook-http` (§4.2: the mandatory parity source).
 * Dependency-free by contract — bundled into a hermetic IIFE embed; JSON
 * parsing is a standard builtin, so the embed stays loader-free.
 *
 * These are the SAME semantics the kernel's `http.api` ingress adapter
 * applies at the delivery boundary — one behavior, two surfaces, parity by
 * shared shape code.
 */

export interface HttpDelivery {
  rawBody?: unknown;
}

export type BodyParse =
  | { ok: true; body: unknown }
  | { ok: false; reason: 'malformed_json' };

/** Parse the raw delivery body. Objects AND arrays pass verbatim. */
export function parseBody(delivery: HttpDelivery | null | undefined): BodyParse {
  const raw = delivery?.rawBody;
  if (typeof raw !== 'string') return { ok: false, reason: 'malformed_json' };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: 'malformed_json' };
  }
}

/**
 * Provider event identity for generic deliveries: a string `type` field on
 * an object body, else absent (the kernel dedupe gate then has nothing to
 * key on and skips).
 */
export function eventKindOf(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    const kind = (body as Record<string, unknown>).type;
    if (typeof kind === 'string' && kind !== '') return kind;
  }
  return undefined;
}
