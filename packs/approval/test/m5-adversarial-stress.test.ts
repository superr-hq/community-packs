import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

import {
  buildNotifySpec,
  classifyMessagingTransportError,
  parseClickDelivery,
} from '../runtime/approve.shape.js';

describe('M5 Adversarial Approval Stress & Fuzzing (Focus Area 4)', () => {
  it('Property: Prototype pollution & injection resilience across 1,000 adversarial payloads', () => {
    const maliciousKeys = [
      '__proto__',
      'constructor',
      'prototype',
      'valueOf',
      'toString',
      'isPrototypeOf',
      'hasOwnProperty',
    ];

    for (let i = 0; i < 1000; i++) {
      const payload: Record<string, unknown> = {};
      const key = maliciousKeys[i % maliciousKeys.length]!;

      payload[key] = {
        decision: 'approved',
        admin: true,
        polluted: true,
      };

      if (i % 3 === 0) {
        payload['postbackPayload'] = `v1:tok_${i}:approved`;
      } else if (i % 3 === 1) {
        payload['decision'] = 'rejected';
      } else {
        payload['callbackData'] = `malformed_injection_{${key}}`;
      }

      let parsed: ReturnType<typeof parseClickDelivery> | undefined;
      expect(() => {
        parsed = parseClickDelivery(payload);
      }).not.toThrow();

      expect(parsed).toBeDefined();
      if (parsed!.ok) {
        expect(['approved', 'rejected']).toContain(parsed!.decision);
      } else {
        expect(parsed!.ok).toBe(false);
      }

      // Verify no global prototype pollution occurred
      expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    }
  });

  it('Property: Outbound notification spec stability under 1,000 extreme configurations', () => {
    for (let i = 0; i < 1000; i++) {
      const token = `tok_stress_${i}_${crypto.randomBytes(8).toString('hex')}`;
      const msg = i % 2 === 0 ? `Message ${i}` : '   ';
      const summary = i % 3 === 0 ? `Summary ${i}` : '';
      const recipient = i % 4 === 0 ? `user_${i}@example.com` : '   ';

      const spec = buildNotifySpec({ summary }, { message: msg, recipient }, token);

      expect(spec.buttons).toHaveLength(2);
      expect(spec.buttons![0]!).toEqual({
        type: 'postback',
        title: 'Approve',
        payload: `v1:${token}:approved`,
      });
      expect(spec.buttons![1]!).toEqual({
        type: 'postback',
        title: 'Reject',
        payload: `v1:${token}:rejected`,
      });

      // Text precedence: message > summary > default
      if (msg.trim() !== '') {
        expect(spec.text).toBe(msg);
      } else if (summary.trim() !== '') {
        expect(spec.text).toBe(summary);
      } else {
        expect(spec.text).toBe('Approval requested');
      }

      if (recipient.trim() !== '') {
        expect(spec.recipient).toBe(recipient);
      } else {
        expect(spec.recipient).toBeUndefined();
      }
    }
  });

  it('Property: Multi-platform metadata extraction precedence & fallback under fuzzing', () => {
    const platforms = ['slack', 'teams', 'discord', 'telegram', 'whatsapp', 'sms', 'custom_webhook'];

    for (let i = 0; i < 1000; i++) {
      const token = `tok_platform_${i}`;
      const decision = i % 2 === 0 ? 'approved' : 'rejected';
      const platform = platforms[i % platforms.length]!;

      let rawPayload: Record<string, unknown>;

      switch (i % 7) {
        case 0:
          // Direct postback
          rawPayload = {
            postbackPayload: `v1:${token}:${decision}`,
            comment: 'Direct comment',
            decidedBy: 'alice',
            channel: platform,
          };
          break;
        case 1:
          // Telegram style callbackData
          rawPayload = {
            callbackData: `v1:${token}:${decision}`,
            from: { name: 'Alice Telegram', id: 'tg_123' },
            source: platform,
          };
          break;
        case 2:
          // WhatsApp interactive button reply
          rawPayload = {
            interactive: {
              button_reply: { id: `v1:${token}:${decision}`, title: decision },
            },
            user: { name: 'Alice WhatsApp', id: 'wa_999' },
            platform,
          };
          break;
        case 3:
          // WhatsApp interactive list reply
          rawPayload = {
            interactive: {
              list_reply: { id: `v1:${token}:${decision}`, title: decision },
            },
            sender: { id: 'sender_wa' },
            via: platform,
          };
          break;
        case 4:
          // Quick reply
          rawPayload = {
            quickReplyPayload: `v1:${token}:${decision}`,
            note: 'Quick note',
            user: { id: 'usr_qr' },
          };
          break;
        case 5:
          // Action array
          rawPayload = {
            actions: [{ value: `v1:${token}:${decision}` }],
            comment: 'Action comment',
            decidedBy: 'admin_action',
          };
          break;
        default:
          // Direct decision
          rawPayload = {
            decision,
            comment: 'Simple decision',
            decidedBy: 'direct_user',
            decidedVia: platform,
          };
          break;
      }

      const res = parseClickDelivery(rawPayload);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.decision).toBe(decision);
        if ('token' in res && res.token !== undefined) {
          expect(res.token).toBe(token);
        }
      }
    }
  });

  it('Property: Exhaustive error taxonomy classification coverage across status codes and message patterns', () => {
    // 1. HTTP 429 -> APPROVAL_SEND_RATE_LIMITED (warn, retryable)
    const e429 = classifyMessagingTransportError({ status: 429, message: 'Too many requests' });
    expect(e429).toMatchObject({ code: 'APPROVAL_SEND_RATE_LIMITED', severity: 'warn', retryable: true });

    // 2. HTTP 401/403 -> APPROVAL_SEND_AUTH_REJECTED (error, non-retryable)
    const e401 = classifyMessagingTransportError({ status: 401, message: 'Invalid bot token' });
    expect(e401).toMatchObject({ code: 'APPROVAL_SEND_AUTH_REJECTED', severity: 'error', retryable: false });
    const e403 = classifyMessagingTransportError({ status: 403, message: 'Forbidden access' });
    expect(e403).toMatchObject({ code: 'APPROVAL_SEND_AUTH_REJECTED', severity: 'error', retryable: false });

    // 3. HTTP 404 -> APPROVAL_RECIPIENT_UNREACHABLE (error, non-retryable)
    const e404 = classifyMessagingTransportError({ status: 404, message: 'Recipient not found' });
    expect(e404).toMatchObject({ code: 'APPROVAL_RECIPIENT_UNREACHABLE', severity: 'error', retryable: false });

    // 4. HTTP 410/422 -> APPROVAL_SEND_WINDOW_CLOSED (error, non-retryable)
    const e410 = classifyMessagingTransportError({ status: 410, message: 'Session expired' });
    expect(e410).toMatchObject({ code: 'APPROVAL_SEND_WINDOW_CLOSED', severity: 'error', retryable: false });
    const e422 = classifyMessagingTransportError({ status: 422, message: 'Unprocessable entity - window closed' });
    expect(e422).toMatchObject({ code: 'APPROVAL_SEND_WINDOW_CLOSED', severity: 'error', retryable: false });

    // 5. String-based message classifications
    expect(classifyMessagingTransportError('Error: rate limit exceeded on channel')).toMatchObject({
      code: 'APPROVAL_SEND_RATE_LIMITED',
      severity: 'warn',
      retryable: true,
    });
    expect(classifyMessagingTransportError('Unauthorized webhook access token')).toMatchObject({
      code: 'APPROVAL_SEND_AUTH_REJECTED',
      severity: 'error',
      retryable: false,
    });
    expect(classifyMessagingTransportError('User recipient unreachable or blocked')).toMatchObject({
      code: 'APPROVAL_RECIPIENT_UNREACHABLE',
      severity: 'error',
      retryable: false,
    });
    expect(classifyMessagingTransportError('24-hour messaging window is closed')).toMatchObject({
      code: 'APPROVAL_SEND_WINDOW_CLOSED',
      severity: 'error',
      retryable: false,
    });
  });

  it('Property: Immutability invariant — parseClickDelivery never mutates input arguments', () => {
    const input = Object.freeze({
      postbackPayload: 'v1:tok_immutability:approved',
      user: Object.freeze({ name: 'Bob' }),
      nested: Object.freeze({ count: 1 }),
    });

    expect(() => {
      const res = parseClickDelivery(input);
      expect(res.ok).toBe(true);
    }).not.toThrow();
  });
});
