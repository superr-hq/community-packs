import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

import {
  APPROVAL_DECISIONS,
  buildNotifySpec,
  classifyMessagingTransportError,
  decodeApprovalPayload,
  encodeApprovalPayload,
  parseClickDelivery,
  type ApprovalDecision,
} from '../runtime/approve.shape.js';

describe('Adversarial Fuzz & Stress Harness', () => {
  it('Property 1: Codec roundtrip and <=64 byte bound across 1,000 randomized valid tokens', () => {
    const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~';
    const decisions: ApprovalDecision[] = ['approved', 'rejected'];

    for (let i = 0; i < 1000; i++) {
      const len = 1 + Math.floor(Math.random() * 52); // length 1..52
      let token = '';
      for (let j = 0; j < len; j++) {
        token += validChars[Math.floor(Math.random() * validChars.length)];
      }
      const decision = decisions[i % 2];

      const encoded = encodeApprovalPayload(token, decision);
      const byteLen = Buffer.byteLength(encoded, 'utf8');

      // Invariant: Must never exceed 64 bytes
      expect(byteLen).toBeLessThanOrEqual(64);

      // Invariant: Roundtrip decode must match exactly
      const decoded = decodeApprovalPayload(encoded);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.token).toBe(token);
        expect(decoded.decision).toBe(decision);
      }
    }
  });

  it('Property 2: Codec fail-closed safety across 1,000 random string and binary mutations', () => {
    for (let i = 0; i < 1000; i++) {
      // Generate random mutation: random length, random binary/ascii bytes
      const randomBytes = crypto.randomBytes(Math.floor(Math.random() * 80));
      const mutation = randomBytes.toString(i % 2 === 0 ? 'utf8' : 'hex');

      // Invariant: Must never throw
      let result: ReturnType<typeof decodeApprovalPayload> | undefined;
      expect(() => {
        result = decodeApprovalPayload(mutation);
      }).not.toThrow();

      if (result && result.ok) {
        expect(APPROVAL_DECISIONS).toContain(result.decision);
        expect(typeof result.token).toBe('string');
        expect(result.token.length).toBeGreaterThan(0);
      } else if (result) {
        expect(result.ok).toBe(false);
        expect(typeof result.reason).toBe('string');
      }
    }
  });

  it('Property 3: parseClickDelivery fail-closed safety across 1,000 fuzz objects', () => {
    const junkValues = [
      null,
      undefined,
      0,
      1,
      -1,
      NaN,
      Infinity,
      '',
      ' ',
      '   ',
      'true',
      'false',
      'approved',
      'rejected',
      'expired',
      'maybe',
      'v1:token:approved',
      'v1:token:rejected',
      'v1:token:invalid',
      {},
      [],
      { decision: 'approved' },
      { decision: 'rejected' },
      { decision: 123 },
      { postbackPayload: 'v1:tok:approved' },
      { callbackData: 'v1:tok:rejected' },
      { interactive: { button_reply: { id: 'v1:tok:approved' } } },
      { interactive: { list_reply: { id: 'v1:tok:rejected' } } },
      { expired: true },
      { expired: false },
    ];

    for (let i = 0; i < 1000; i++) {
      const fuzzObj: Record<string, unknown> = {};
      const keyCount = Math.floor(Math.random() * 5);
      for (let k = 0; k < keyCount; k++) {
        const key = ['decision', 'comment', 'decidedBy', 'decidedVia', 'postbackPayload', 'quickReplyPayload', 'callbackData', 'buttonPayload', 'interactiveId', 'payload', 'expired', 'user', 'from', 'sender', 'randomKey'][Math.floor(Math.random() * 15)];
        fuzzObj[key] = junkValues[Math.floor(Math.random() * junkValues.length)];
      }

      let parsed: ReturnType<typeof parseClickDelivery> | undefined;
      expect(() => {
        parsed = parseClickDelivery(fuzzObj);
      }).not.toThrow();

      if (parsed && parsed.ok) {
        expect(APPROVAL_DECISIONS).toContain(parsed.decision);
      } else if (parsed) {
        expect(parsed.ok).toBe(false);
        expect(['missing', 'invalid', 'expired']).toContain(parsed.reason);
      }
    }
  });

  it('Property 4: classifyMessagingTransportError covers error status ranges robustly', () => {
    const testCases = [
      { input: { status: 429 }, expectedCode: 'APPROVAL_SEND_RATE_LIMITED', expectedSev: 'warn', retryable: true },
      { input: { status: 401 }, expectedCode: 'APPROVAL_SEND_AUTH_REJECTED', expectedSev: 'error', retryable: false },
      { input: { status: 403 }, expectedCode: 'APPROVAL_SEND_AUTH_REJECTED', expectedSev: 'error', retryable: false },
      { input: { status: 404 }, expectedCode: 'APPROVAL_RECIPIENT_UNREACHABLE', expectedSev: 'error', retryable: false },
      { input: { status: 410 }, expectedCode: 'APPROVAL_SEND_WINDOW_CLOSED', expectedSev: 'error', retryable: false },
      { input: { status: 422 }, expectedCode: 'APPROVAL_SEND_WINDOW_CLOSED', expectedSev: 'error', retryable: false },
      { input: new Error('Rate limit exceeded'), expectedCode: 'APPROVAL_SEND_RATE_LIMITED', expectedSev: 'warn', retryable: true },
      { input: new Error('User is unreachable'), expectedCode: 'APPROVAL_RECIPIENT_UNREACHABLE', expectedSev: 'error', retryable: false },
      { input: new Error('Window is closed'), expectedCode: 'APPROVAL_SEND_WINDOW_CLOSED', expectedSev: 'error', retryable: false },
      { input: new Error('Unauthorized request'), expectedCode: 'APPROVAL_SEND_AUTH_REJECTED', expectedSev: 'error', retryable: false },
      { input: new Error('Unknown unexpected failure'), expectedCode: 'APPROVAL_SEND_AUTH_REJECTED', expectedSev: 'error', retryable: false },
    ];

    for (const tc of testCases) {
      const classified = classifyMessagingTransportError(tc.input);
      expect(classified.code).toBe(tc.expectedCode);
      expect(classified.severity).toBe(tc.expectedSev);
      expect(classified.retryable).toBe(tc.retryable);
    }
  });

  it('Property 5: buildNotifySpec invariants under stress', () => {
    for (let i = 0; i < 500; i++) {
      const summary = i % 3 === 0 ? `Summary ${i}` : i % 3 === 1 ? '   ' : undefined;
      const message = i % 4 === 0 ? `Message ${i}` : i % 4 === 1 ? '' : undefined;
      const recipient = i % 2 === 0 ? `user_${i}` : undefined;
      const token = `tok_${i}`;

      const spec = buildNotifySpec({ summary }, { channel: 'messaging', message, recipient }, token);

      expect(spec.buttons).toBeDefined();
      expect(spec.buttons).toHaveLength(2);
      expect(spec.buttons![0].title).toBe('Approve');
      expect(spec.buttons![0].payload).toBe(`v1:${token}:approved`);
      expect(spec.buttons![1].title).toBe('Reject');
      expect(spec.buttons![1].payload).toBe(`v1:${token}:rejected`);

      if (message && message.trim()) {
        expect(spec.text).toBe(message.trim());
      } else if (summary && summary.trim()) {
        expect(spec.text).toBe(summary.trim());
      } else {
        expect(spec.text).toBe('Approval requested');
      }

      if (recipient && recipient.trim()) {
        expect(spec.recipient).toBe(recipient.trim());
      } else {
        expect(spec.recipient).toBeUndefined();
      }
    }
  });
});
