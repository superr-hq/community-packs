/**
 * Protocol adapter for `social.threads` (D03 §7): this pack's protocol
 * knowledge — HMAC signature verification, envelope normalization, and the
 * platform-discrimination + subscription gates.
 *
 * The value STRUCTURALLY satisfies the kernel's `ProtocolAdapter` surface;
 * §2.1 forbids importing the kernel from a pack, so the twin interfaces
 * below are the contract view and registration sites (runtime hosts) pass
 * this adapter to `kernel.registerProtocol('social.threads', …)`. The pure
 * halves live in `./crypto.shape.js` / `./api.shape.js` — the same code the
 * nodes embed, so gate behavior can never drift between ingress and steps.
 */

import { hmacSha256Hex, verifyHexSignature } from './crypto.shape.js';
import {
  isSubscribedType,
  normalizeEvent,
  parseEventBody,
  SIGNATURE_HEADER,
  subscribedTypesOrAll,
} from './api.shape.js';

// ── Structural twins of the kernel surfaces (§4.2/D03 §7) ──────────────────

interface AdapterDelivery {
  path: string;
  headers: Record<string, string>;
  rawBody: string;
}

interface AdapterCallContext {
  route: { auth?: { kind?: string; header?: string; secretRef?: string } };
  /** Trigger-instance config from the pinned version (gate input). */
  config: Record<string, unknown>;
  secret(ref: string): Promise<string | undefined>;
}

export interface ProtocolAdapterLike {
  authenticate(
    delivery: AdapterDelivery,
    ctx: AdapterCallContext,
  ): { ok: true } | { ok: false; message: string } | Promise<{ ok: true } | { ok: false; message: string }>;
  normalize(
    delivery: AdapterDelivery,
    ctx: AdapterCallContext,
  ):
    | { ok: true; event: { eventId?: string; eventKind?: string; ports: Record<string, unknown> } }
    | { ok: false; reason: string; message: string }
    | Promise<
        | { ok: true; event: { eventId?: string; eventKind?: string; ports: Record<string, unknown> } }
        | { ok: false; reason: string; message: string }
      >;
}

/** Case-insensitive header lookup (names arrive case-preserved). */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

export const threadsProtocolAdapter: ProtocolAdapterLike = {
  async authenticate(delivery, ctx) {
    const spec = ctx.route.auth ?? {};
    const headerName = spec.header ?? SIGNATURE_HEADER;
    const secretRef = spec.secretRef;
    if (!secretRef) {
      return { ok: false, message: 'hmac auth declares no secretRef to check against' };
    }
    const provided = headerValue(delivery.headers, headerName);
    const secret = await ctx.secret(secretRef);
    if (!provided || !secret) {
      return { ok: false, message: 'missing signature header or unresolvable secretRef' };
    }
    return verifyHexSignature(hmacSha256Hex(secret, delivery.rawBody), provided)
      ? { ok: true }
      : { ok: false, message: 'signature does not match request body' };
  },

  normalize(delivery, ctx) {
    const parsed = parseEventBody(delivery);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: 'malformed_json',
        message:
          parsed.reason === 'not_object'
            ? 'request body is not a JSON object'
            : 'request body is not valid JSON',
      };
    }

    // Platform discrimination FIRST — one shared backend webhook must never
    // leak sibling-platform traffic into a threads workflow.
    const normalized = normalizeEvent(parsed.body);
    if (!normalized.ok) {
      return normalized.reason === 'foreign_platform'
        ? { ok: false, reason: 'foreign_platform', message: 'event belongs to a different platform' }
        : { ok: false, reason: 'unsubscribed_event_type', message: 'delivery carries no event kind' };
    }

    // Subscription gate — mirrors the node step's default-all semantics.
    const subscribed = subscribedTypesOrAll(ctx.config);
    if (!isSubscribedType(normalized.event.type, subscribed)) {
      return {
        ok: false,
        reason: 'unsubscribed_event_type',
        message: `event type '${normalized.event.type}' is not in this trigger's subscription`,
      };
    }

    return {
      ok: true,
      event: {
        ...(normalized.event.id === undefined ? {} : { eventId: normalized.event.id }),
        eventKind: normalized.event.type,
        ports: { event: normalized.event },
      },
    };
  },
};
