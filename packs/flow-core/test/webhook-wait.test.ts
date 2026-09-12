import type { NodeContext } from '@superr-hq/sdk';
import { describe, expect, it } from 'vitest';

import {
  execute,
  WebhookWaitError,
  WebhookWaitTimeoutError,
} from '../runtime/webhook-wait.op.js';
import {
  expiryIso,
  isResumeDelivery,
  normalizeWebhookDelivery,
} from '../runtime/webhook-wait.shape.js';

function mockContext(overrides: Partial<NodeContext> = {}): NodeContext {
  return {
    instanceKey: 'wait_hook',
    inputs: {},
    config: {},
    env: {},
    ok: (ports) => ({ status: 'ok', ports }),
    fail: (code, message, details) => ({ status: 'failed', error: { code, message, details } }),
    ...overrides,
  };
}

describe('flow-core/webhook-wait — pure shape (webhook-wait.shape.ts)', () => {
  it('normalizes a structured callback delivery', () => {
    const delivery = {
      body: { event: 'invoice.paid', id: 'in_123' },
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': 'sig_abc',
        'X-Number': 42,
      },
      query: {
        source: 'billing',
        retry: true,
      },
      method: 'post',
    };

    const res = normalizeWebhookDelivery(delivery);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output.body).toEqual({ event: 'invoice.paid', id: 'in_123' });
      expect(res.output.headers).toEqual({
        'content-type': 'application/json',
        'x-signature': 'sig_abc',
        'x-number': '42',
      });
      expect(res.output.query).toEqual({
        source: 'billing',
        retry: 'true',
      });
      expect(res.output.method).toBe('POST');
    }
  });

  it('parses rawBody JSON string into body object', () => {
    const delivery = {
      rawBody: JSON.stringify({ message: 'hello world', count: 10 }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    };

    const res = normalizeWebhookDelivery(delivery);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output.body).toEqual({ message: 'hello world', count: 10 });
      expect(res.output.method).toBe('PUT');
      expect(res.output.query).toEqual({});
    }
  });

  it('falls back to string if rawBody is not valid JSON', () => {
    const delivery = {
      rawBody: 'raw text webhook content',
      headers: { 'content-type': 'text/plain' },
    };

    const res = normalizeWebhookDelivery(delivery);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.output.body).toBe('raw text webhook content');
      expect(res.output.method).toBe('POST');
    }
  });

  it('provides safe defaults on empty or null delivery', () => {
    const emptyRes = normalizeWebhookDelivery({});
    expect(emptyRes.ok).toBe(true);
    if (emptyRes.ok) {
      expect(emptyRes.output).toEqual({
        body: {},
        headers: {},
        query: {},
        method: 'POST',
      });
    }

    const nullRes = normalizeWebhookDelivery(null);
    expect(nullRes.ok).toBe(true);
    if (nullRes.ok) {
      expect(nullRes.output).toEqual({
        body: {},
        headers: {},
        query: {},
        method: 'POST',
      });
    }
  });

  it('detects timeout / expired delivery and returns WEBHOOK_WAIT_TIMEOUT', () => {
    const expiredRes = normalizeWebhookDelivery(
      { expired: true, expiredAt: '2026-09-01T10:00:00.000Z' },
      { timeoutMs: 60000 },
    );
    expect(expiredRes.ok).toBe(false);
    if (!expiredRes.ok) {
      expect(expiredRes.code).toBe('WEBHOOK_WAIT_TIMEOUT');
      expect(expiredRes.details.expiredAt).toBe('2026-09-01T10:00:00.000Z');
      expect(expiredRes.details.timeoutMs).toBe(60000);
    }

    const timeoutReasonRes = normalizeWebhookDelivery({ reason: 'timeout' });
    expect(timeoutReasonRes.ok).toBe(false);
    if (!timeoutReasonRes.ok) {
      expect(timeoutReasonRes.code).toBe('WEBHOOK_WAIT_TIMEOUT');
    }
  });

  it('isResumeDelivery correctly identifies delivery shapes', () => {
    expect(isResumeDelivery({ body: {} })).toBe(true);
    expect(isResumeDelivery({ rawBody: 'test' })).toBe(true);
    expect(isResumeDelivery({ headers: {} })).toBe(true);
    expect(isResumeDelivery({ query: {} })).toBe(true);
    expect(isResumeDelivery({ method: 'GET' })).toBe(true);
    expect(isResumeDelivery({ expired: true })).toBe(true);
    expect(isResumeDelivery({})).toBe(false);
    expect(isResumeDelivery(null)).toBe(false);
    expect(isResumeDelivery(undefined)).toBe(false);
  });

  it('expiryIso computes expected instant or undefined', () => {
    const now = 1700000000000;
    expect(expiryIso(60000, now)).toBe(new Date(now + 60000).toISOString());
    expect(expiryIso(undefined, now)).toBeUndefined();
    expect(expiryIso(null, now)).toBeUndefined();
    expect(expiryIso(-50, now)).toBeUndefined();
    expect(expiryIso('not a number', now)).toBeUndefined();
  });
});

describe('flow-core/webhook-wait — local runtime op (webhook-wait.op.ts)', () => {
  it('executes successfully and returns ctx.ok with parsed output', async () => {
    const ctx = mockContext({
      delivery: {
        body: { status: 'success' },
        headers: { authorization: 'Bearer token' },
        query: { ref: '123' },
        method: 'POST',
      },
    });

    const res = await execute(ctx);
    expect(res.status).toBe('ok');
    expect(res.ports).toEqual({
      body: { status: 'success' },
      headers: { authorization: 'Bearer token' },
      query: { ref: '123' },
      method: 'POST',
    });
  });

  it('throws WebhookWaitTimeoutError when delivery indicates expiration', async () => {
    const ctx = mockContext({
      delivery: {
        expired: true,
        expiredAt: '2026-09-01T12:00:00.000Z',
      },
      config: {
        timeoutMs: 3600000,
      },
    });

    await expect(execute(ctx)).rejects.toThrow(WebhookWaitTimeoutError);
    try {
      await execute(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(WebhookWaitTimeoutError);
      const waitErr = err as WebhookWaitTimeoutError;
      expect(waitErr.code).toBe('WEBHOOK_WAIT_TIMEOUT');
      expect(waitErr.details.expiredAt).toBe('2026-09-01T12:00:00.000Z');
      expect(waitErr.details.timeoutMs).toBe(3600000);
    }
  });

  it('returns default ports on unseeded execution without delivery', async () => {
    const ctx = mockContext({});
    const res = await execute(ctx);
    expect(res.status).toBe('ok');
    expect(res.ports).toEqual({
      body: {},
      headers: {},
      query: {},
      method: 'POST',
    });
  });

  it('constructs WebhookWaitError with proper properties', () => {
    const err = new WebhookWaitError({
      code: 'WEBHOOK_WAIT_TIMEOUT',
      message: 'Custom timeout error',
      severity: 'error',
      retryable: false,
      details: { foo: 'bar' },
    });
    expect(err.name).toBe('WebhookWaitError');
    expect(err.code).toBe('WEBHOOK_WAIT_TIMEOUT');
    expect(err.message).toBe('Custom timeout error');
    expect(err.details).toEqual({ foo: 'bar' });
  });
});
