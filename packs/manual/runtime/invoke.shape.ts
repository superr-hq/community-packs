/**
 * Pure shaping logic for `invoke` (§4.2: the mandatory parity source).
 * Dependency-free by contract — bundled into a hermetic IIFE embed.
 *
 * Manual fires are STRICT: an explicit payload is part of the contract, and
 * `null` is a legitimate payload (distinct from "not provided") because the
 * resolver's null-is-a-value semantics run the whole way through (§4.5).
 */

export interface InvokeDelivery {
  payload?: unknown;
}

export type PayloadCheck =
  | { ok: true; payload: unknown }
  | { ok: false; reason: 'payload_required' };

/**
 * Accept the delivery only when its `payload` key is PRESENT. Absent ⇒
 * typed failure; present-but-null passes verbatim.
 */
export function extractPayload(delivery: InvokeDelivery | null | undefined): PayloadCheck {
  if (delivery === null || delivery === undefined || !('payload' in delivery)) {
    return { ok: false, reason: 'payload_required' };
  }
  return { ok: true, payload: delivery.payload };
}
