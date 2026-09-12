/**
 * Pure shaping logic for the `events` trigger (§4.2). Re-derives, at step
 * level, EXACTLY what the pack's ingress adapter accepts — one behavior,
 * two surfaces, parity by shared shape code (`./api.shape.js`).
 */

import {
  EVENT_TYPES,
  isSubscribedType,
  normalizeEvent,
  parseEventBody,
  subscribedTypesOrAll,
} from './api.shape.js';
import type { SocialDelivery, SocialEvent } from './api.shape.js';

export { EVENT_TYPES };

export type EventVerdict =
  | { kind: 'ok'; event: SocialEvent }
  | { kind: 'skip'; skipCode: 'UNSUBSCRIBED_EVENT_TYPE' | 'FOREIGN_PLATFORM' }
  | { kind: 'fail'; code: 'MALFORMED_EVENT'; reason: string };

/**
 * Full gate chain for one delivery against the instance's subscription:
 * parse → platform discrimination → subscribed-type gate → normalized port.
 */
export function shapeDelivery(
  delivery: SocialDelivery | null | undefined,
  subscribedTypes: readonly unknown[],
): EventVerdict {
  const parsed = parseEventBody(delivery);
  if (!parsed.ok) return { kind: 'fail', code: 'MALFORMED_EVENT', reason: parsed.reason };
  const normalized = normalizeEvent(parsed.body);
  if (!normalized.ok) {
    if (normalized.reason === 'foreign_platform') {
      return { kind: 'skip', skipCode: 'FOREIGN_PLATFORM' };
    }
    return { kind: 'fail', code: 'MALFORMED_EVENT', reason: normalized.reason };
  }
  if (!isSubscribedType(normalized.event.type, subscribedTypes)) {
    return { kind: 'skip', skipCode: 'UNSUBSCRIBED_EVENT_TYPE' };
  }
  return { kind: 'ok', event: normalized.event };
}

/** Config reader: `eventTypes` defaults to EVERYTHING this pack consumes. */
export function subscribedTypesOf(config: Record<string, unknown>): string[] {
  return subscribedTypesOrAll(config);
}
