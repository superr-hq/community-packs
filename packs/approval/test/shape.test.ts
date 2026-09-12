import { describe, expect, it } from 'vitest';

import {
  APPROVAL_DECISIONS,
  buildNotifySpec,
  checkDecision,
  classifyMessagingTransportError,
  decodeApprovalPayload,
  encodeApprovalPayload,
  expiryIso,
  isResumeDelivery,
  optionalText,
  parseClickDelivery,
} from '../runtime/approve.shape.js';

describe('approve.shape — token codec', () => {
  it('exposes the approval decisions vocabulary', () => {
    expect(APPROVAL_DECISIONS).toEqual(['approved', 'rejected']);
  });

  it('encodes compact payloads guaranteed to be <= 64 bytes', () => {
    const token = 'hk_8f29ab34cd56ef78';
    const payload = encodeApprovalPayload(token, 'approved');
    expect(payload).toBe(`v1:${token}:approved`);
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(64);

    const rejectPayload = encodeApprovalPayload(token, 'rejected');
    expect(rejectPayload).toBe(`v1:${token}:rejected`);
    expect(Buffer.byteLength(rejectPayload, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('decodes valid approval payloads successfully', () => {
    const approved = decodeApprovalPayload('v1:tok_123:approved');
    expect(approved).toEqual({ ok: true, token: 'tok_123', decision: 'approved' });

    const rejected = decodeApprovalPayload('v1:tok_456:rejected');
    expect(rejected).toEqual({ ok: true, token: 'tok_456', decision: 'rejected' });

    const upper = decodeApprovalPayload('v1:tok_789:APPROVED');
    expect(upper).toEqual({ ok: true, token: 'tok_789', decision: 'approved' });
  });

  it('fails to decode malformed or corrupt payloads', () => {
    expect(decodeApprovalPayload(null)).toEqual({ ok: false, reason: 'payload_not_string' });
    expect(decodeApprovalPayload('')).toEqual({ ok: false, reason: 'payload_not_string' });
    expect(decodeApprovalPayload('v2:tok_123:approved')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(decodeApprovalPayload('v1:tok_123')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(decodeApprovalPayload('v1::approved')).toEqual({ ok: false, reason: 'missing_token' });
    expect(decodeApprovalPayload('v1:tok_123:maybe')).toEqual({ ok: false, reason: 'invalid_decision' });
  });
});

describe('approve.shape — outbound notification builder', () => {
  it('builds notification spec with Approve and Reject buttons', () => {
    const spec = buildNotifySpec(
      { summary: 'Deploy release v2.0' },
      { channel: 'messaging', recipient: 'user_123' },
      'tok_deploy',
    );

    expect(spec.recipient).toBe('user_123');
    expect(spec.text).toBe('Deploy release v2.0');
    expect(spec.buttons).toHaveLength(2);
    expect(spec.buttons?.[0]).toEqual({
      type: 'postback',
      title: 'Approve',
      payload: 'v1:tok_deploy:approved',
    });
    expect(spec.buttons?.[1]).toEqual({
      type: 'postback',
      title: 'Reject',
      payload: 'v1:tok_deploy:rejected',
    });
  });

  it('prefers custom config message over input summary', () => {
    const spec = buildNotifySpec(
      { summary: 'Summary text' },
      { channel: 'messaging', message: 'Custom message override' },
      'tok_msg',
    );
    expect(spec.text).toBe('Custom message override');
  });

  it('uses default fallback text if neither summary nor message is provided', () => {
    const spec = buildNotifySpec({}, {}, 'tok_fallback');
    expect(spec.text).toBe('Approval requested');
  });
});

describe('approve.shape — click delivery parser matrix', () => {
  it('parses direct decision shapes with case/whitespace tolerance', () => {
    const directApproved = parseClickDelivery({ decision: 'approved', decidedBy: 'ada' });
    expect(directApproved).toEqual({
      ok: true,
      decision: 'approved',
      decidedBy: 'ada',
    });

    const directRejected = parseClickDelivery({ decision: '  REJECTED  ', comment: 'no' });
    expect(directRejected).toEqual({
      ok: true,
      decision: 'rejected',
      comment: 'no',
    });
  });

  it('parses postback payloads from interactive clicks', () => {
    const parsed = parseClickDelivery({
      postbackPayload: 'v1:tok_abc:approved',
      decidedBy: 'alice',
      decidedVia: 'messaging',
    });
    expect(parsed).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_abc',
      decidedBy: 'alice',
      decidedVia: 'messaging',
    });

    const nestedPostback = parseClickDelivery({
      postback: { payload: 'v1:tok_def:rejected' },
      user: { name: 'bob' },
    });
    expect(nestedPostback).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_def',
      decidedBy: 'bob',
      decidedVia: 'messaging',
    });
  });

  it('parses quick reply and callbackData payloads', () => {
    const qr = parseClickDelivery({
      quickReplyPayload: 'v1:tok_qr:approved',
      sender: { id: 'user_99' },
    });
    expect(qr).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_qr',
      decidedBy: 'user_99',
      decidedVia: 'messaging',
    });

    const cb = parseClickDelivery({
      callbackData: 'v1:tok_cb:rejected',
      from: { name: 'carol' },
      channel: 'messaging',
    });
    expect(cb).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_cb',
      decidedBy: 'carol',
      decidedVia: 'messaging',
    });
  });

  it('parses interactive button replies', () => {
    const interactive = parseClickDelivery({
      interactive: { button_reply: { id: 'v1:tok_int:approved' } },
      user: { id: 'user_int' },
    });
    expect(interactive).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_int',
      decidedBy: 'user_int',
      decidedVia: 'messaging',
    });
  });

  it('fails closed on invalid decisions, missing inputs, and malformed payloads', () => {
    expect(parseClickDelivery(null)).toEqual({ ok: false, reason: 'missing' });
    expect(parseClickDelivery(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(parseClickDelivery({})).toEqual({ ok: false, reason: 'missing' });
    expect(parseClickDelivery({ decision: 123 })).toEqual({ ok: false, reason: 'invalid', received: 123 });
    expect(parseClickDelivery({ decision: 'maybe' })).toEqual({ ok: false, reason: 'invalid', received: 'maybe' });
    expect(parseClickDelivery({ postbackPayload: 'invalid_codec_string' })).toEqual({
      ok: false,
      reason: 'invalid',
      received: 'invalid_codec_string',
    });
  });

  it('identifies expired delivery', () => {
    const expired = parseClickDelivery({ expired: true, expiredAt: '2026-08-29T10:00:00.000Z' });
    expect(expired.ok).toBe(false);
    expect(expired.reason).toBe('expired');
  });

  it('checkDecision maintains backward compatibility', () => {
    expect(checkDecision({ decision: 'approved' })).toEqual({ ok: true, decision: 'approved' });
    expect(checkDecision({ decision: 'rejected' })).toEqual({ ok: true, decision: 'rejected' });
    expect(checkDecision({})).toEqual({ ok: false, reason: 'missing' });
    expect(checkDecision({ decision: 'invalid' })).toEqual({ ok: false, reason: 'invalid', received: 'invalid' });
  });
});

describe('approve.shape — error classification', () => {
  it('maps rate limits to APPROVAL_SEND_RATE_LIMITED (warn, retryable)', () => {
    const classified = classifyMessagingTransportError({ status: 429, message: 'Too many requests' });
    expect(classified.code).toBe('APPROVAL_SEND_RATE_LIMITED');
    expect(classified.severity).toBe('warn');
    expect(classified.retryable).toBe(true);
  });

  it('maps auth errors to APPROVAL_SEND_AUTH_REJECTED (error, non-retryable)', () => {
    const classified401 = classifyMessagingTransportError({ status: 401, message: 'Unauthorized' });
    expect(classified401.code).toBe('APPROVAL_SEND_AUTH_REJECTED');
    expect(classified401.severity).toBe('error');
    expect(classified401.retryable).toBe(false);

    const classified403 = classifyMessagingTransportError({ status: 403, message: 'Forbidden' });
    expect(classified403.code).toBe('APPROVAL_SEND_AUTH_REJECTED');
    expect(classified403.severity).toBe('error');
    expect(classified403.retryable).toBe(false);
  });

  it('maps unreachable recipient to APPROVAL_RECIPIENT_UNREACHABLE', () => {
    const classified = classifyMessagingTransportError({ status: 404, message: 'Recipient not found' });
    expect(classified.code).toBe('APPROVAL_RECIPIENT_UNREACHABLE');
    expect(classified.severity).toBe('error');
    expect(classified.retryable).toBe(false);
  });

  it('maps closed window to APPROVAL_SEND_WINDOW_CLOSED', () => {
    const classified = classifyMessagingTransportError({ status: 410, message: '24-hour window closed' });
    expect(classified.code).toBe('APPROVAL_SEND_WINDOW_CLOSED');
    expect(classified.severity).toBe('error');
    expect(classified.retryable).toBe(false);
  });
});

describe('approve.shape — helpers', () => {
  it('optionalText trims non-empty strings and returns undefined for empty/junk', () => {
    expect(optionalText('  hello  ')).toBe('hello');
    expect(optionalText('')).toBeUndefined();
    expect(optionalText('   ')).toBeUndefined();
    expect(optionalText(123)).toBeUndefined();
    expect(optionalText(null)).toBeUndefined();
  });

  it('expiryIso calculates future ISO date or returns undefined', () => {
    const now = 1700000000000;
    const iso = expiryIso(24, now);
    expect(iso).toBe(new Date(now + 24 * 3600 * 1000).toISOString());
    expect(expiryIso(undefined, now)).toBeUndefined();
    expect(expiryIso(-1, now)).toBeUndefined();
    expect(expiryIso('24', now)).toBeUndefined();
  });

  it('isResumeDelivery distinguishes delivery vs input', () => {
    expect(isResumeDelivery({ decision: 'approved' })).toBe(true);
    expect(isResumeDelivery({ postbackPayload: 'v1:t:approved' })).toBe(true);
    expect(isResumeDelivery({ summary: 'test' }, { channel: 'messaging' })).toBe(false);
    expect(isResumeDelivery({ summary: 'test' }, {})).toBe(true);
  });
});
