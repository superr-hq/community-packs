import { describe, expect, it, vi } from 'vitest';
import type { NodeContext } from '@superr-hq/sdk';

import {
  buildNotifySpec,
  checkDecision,
  classifyMessagingTransportError,
  decodeApprovalPayload,
  encodeApprovalPayload,
  parseClickDelivery,
  type ApprovalDecision,
} from '../runtime/approve.shape.js';
import {
  ApprovalError,
  ApprovalExpiredError,
  InvalidDecisionError,
  execute as executeOp,
} from '../runtime/approve.op.js';

describe('Target 1: Compact Token Size Limits & Codec Invariants', () => {
  it('guarantees payload length <= 64 bytes for all valid token lengths up to 52 ASCII chars', () => {
    const decisions: ApprovalDecision[] = ['approved', 'rejected'];

    // Test token lengths from 1 to 52 characters
    for (let len = 1; len <= 52; len++) {
      const token = 'a'.repeat(len);
      for (const decision of decisions) {
        const payload = encodeApprovalPayload(token, decision);
        const byteLen = Buffer.byteLength(payload, 'utf8');
        expect(byteLen).toBeLessThanOrEqual(64);
        expect(byteLen).toBe(len + 3 + 1 + decision.length);

        const decoded = decodeApprovalPayload(payload);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
          expect(decoded.token).toBe(token);
          expect(decoded.decision).toBe(decision);
        }
      }
    }
  });

  it('handles standard token formats: UUID, ULID, nanoid, hex, run-scoped tokens', () => {
    const realisticTokens = [
      '550e8400-e29b-41d4-a716-446655440000', // UUID v4 (36 chars) -> 48 bytes
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',           // ULID (26 chars) -> 38 bytes
      'V1StGXR8_Z5jdHi6B-myT',                 // NanoID (21 chars) -> 33 bytes
      'hk_8f29ab34cd56ef78',                   // Short hex (19 chars) -> 31 bytes
      'tok_signoff_run_1234567890',            // Run scoped (26 chars) -> 38 bytes
      'cuid_clh1234567890abcdef',              // CUID (24 chars) -> 36 bytes
      't_1',                                   // Minimal token (3 chars) -> 15 bytes
    ];

    for (const token of realisticTokens) {
      for (const decision of ['approved', 'rejected'] as const) {
        const payload = encodeApprovalPayload(token, decision);
        const byteLen = Buffer.byteLength(payload, 'utf8');
        expect(byteLen).toBeLessThanOrEqual(64);

        const decoded = decodeApprovalPayload(payload);
        expect(decoded).toEqual({
          ok: true,
          token,
          decision,
        });
      }
    }
  });

  it('fails closed on malformed, corrupt, or adversarial codec strings', () => {
    const invalidInputs = [
      null,
      undefined,
      123,
      true,
      {},
      [],
      '',
      '   ',
      'v1',
      'v1:',
      'v1::',
      'v1::approved',
      'v1:tok:',
      'v1:tok:invalid_decision',
      'v1:tok:approve', // missing 'd'
      'v1:tok:reject',  // missing 'ed'
      'v1:tok:yes',
      'v1:tok:no',
      'v1:tok:1',
      'v2:tok:approved', // wrong version
      'v1:tok:approved:extra', // extra colon
      'v1:tok:sub:part:approved', // colons in token
      'header:token:approved',
      'v1:token:APPROVED; DROP TABLE tokens;--',
    ];

    for (const input of invalidInputs) {
      const res = decodeApprovalPayload(input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(typeof res.reason).toBe('string');
      }
    }
  });

  it('handles whitespace trimming in encodeApprovalPayload and decodeApprovalPayload', () => {
    const encoded = encodeApprovalPayload('  tok_padded  ', 'approved');
    expect(encoded).toBe('v1:tok_padded:approved');

    const decoded = decodeApprovalPayload('  v1:tok_padded:approved  ');
    expect(decoded).toEqual({
      ok: true,
      token: 'tok_padded',
      decision: 'approved',
    });

    const decodedUpper = decodeApprovalPayload('v1:tok_padded:REJECTED');
    expect(decodedUpper).toEqual({
      ok: true,
      token: 'tok_padded',
      decision: 'rejected',
    });
  });
});

describe('Target 2: Multi-Platform Click Payload Parsing Matrix', () => {
  it('correctly parses direct decision shapes with all metadata variations', () => {
    const full = parseClickDelivery({
      decision: 'approved',
      comment: 'Ship it!',
      decidedBy: 'lead-dev',
      decidedVia: 'web-portal',
    });
    expect(full).toEqual({
      ok: true,
      decision: 'approved',
      comment: 'Ship it!',
      decidedBy: 'lead-dev',
      decidedVia: 'web-portal',
    });

    const mixedCase = parseClickDelivery({
      decision: '  REJECTED  ',
      comment: '  Needs more tests  ',
      decidedBy: '  reviewer  ',
    });
    expect(mixedCase).toEqual({
      ok: true,
      decision: 'rejected',
      comment: 'Needs more tests',
      decidedBy: 'reviewer',
    });
  });

  it('correctly parses postback payload variants (Messenger, Slack-style, Webhooks)', () => {
    // 1. Direct postbackPayload
    const pb1 = parseClickDelivery({
      postbackPayload: 'v1:tok_pb1:approved',
      comment: 'LGTM',
      decidedBy: 'alice',
      decidedVia: 'messaging',
    });
    expect(pb1).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_pb1',
      comment: 'LGTM',
      decidedBy: 'alice',
      decidedVia: 'messaging',
    });

    // 2. Nested postback object
    const pb2 = parseClickDelivery({
      postback: { payload: 'v1:tok_pb2:rejected' },
      user: { name: 'bob_smith', id: 'usr_888' },
      channel: 'messaging',
    });
    expect(pb2).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_pb2',
      decidedBy: 'bob_smith',
      decidedVia: 'messaging',
    });
  });

  it('correctly parses quick reply variants', () => {
    // 1. Direct quickReplyPayload
    const qr1 = parseClickDelivery({
      quickReplyPayload: 'v1:tok_qr1:approved',
      sender: { id: 'usr_sender' },
      platform: 'messaging',
    });
    expect(qr1).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_qr1',
      decidedBy: 'usr_sender',
      decidedVia: 'messaging',
    });

    // 2. Nested quick_reply object
    const qr2 = parseClickDelivery({
      quick_reply: { payload: 'v1:tok_qr2:rejected' },
      from: { name: 'charlie' },
      via: 'messaging',
    });
    expect(qr2).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_qr2',
      decidedBy: 'charlie',
      decidedVia: 'messaging',
    });
  });

  it('correctly parses Telegram callbackData payloads', () => {
    const cb = parseClickDelivery({
      callbackData: 'v1:tok_tg:approved',
      from: { id: 'tg_user_123', name: 'Telegram User' },
      source: 'messaging',
      note: 'Approved on mobile',
    });
    expect(cb).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_tg',
      comment: 'Approved on mobile',
      decidedBy: 'Telegram User',
      decidedVia: 'messaging',
    });
  });

  it('correctly parses WhatsApp interactive replies (button_reply & list_reply)', () => {
    // 1. WhatsApp button reply
    const waBtn = parseClickDelivery({
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: 'v1:tok_wa_btn:approved',
          title: 'Approve',
        },
      },
      from: { id: 'wa_phone_number' },
    });
    expect(waBtn).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_wa_btn',
      decidedBy: 'wa_phone_number',
      decidedVia: 'messaging',
    });

    // 2. WhatsApp list reply
    const waList = parseClickDelivery({
      interactive: {
        type: 'list_reply',
        list_reply: {
          id: 'v1:tok_wa_list:rejected',
          title: 'Reject',
        },
      },
      user: { id: 'wa_user_999' },
    });
    expect(waList).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_wa_list',
      decidedBy: 'wa_user_999',
      decidedVia: 'messaging',
    });
  });

  it('correctly parses buttonPayload, interactiveId, payload, and actions array', () => {
    expect(parseClickDelivery({ buttonPayload: 'v1:tok_btn:approved' })).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_btn',
      decidedVia: 'messaging',
    });

    expect(parseClickDelivery({ interactiveId: 'v1:tok_int:rejected' })).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_int',
      decidedVia: 'messaging',
    });

    expect(parseClickDelivery({ payload: 'v1:tok_p:approved' })).toEqual({
      ok: true,
      decision: 'approved',
      token: 'tok_p',
      decidedVia: 'messaging',
    });

    expect(parseClickDelivery({ actions: [{ value: 'v1:tok_act:rejected' }] })).toEqual({
      ok: true,
      decision: 'rejected',
      token: 'tok_act',
      decidedVia: 'messaging',
    });
  });

  it('supports raw fallback when payload string is simply "approved" or "rejected"', () => {
    expect(parseClickDelivery({ postbackPayload: 'approved', decidedBy: 'dave' })).toEqual({
      ok: true,
      decision: 'approved',
      decidedBy: 'dave',
      decidedVia: 'messaging',
    });

    expect(parseClickDelivery({ callbackData: 'REJECTED', decidedVia: 'webhook' })).toEqual({
      ok: true,
      decision: 'rejected',
      decidedVia: 'webhook',
    });
  });

  it('enforces fail-closed behavior on missing, invalid, or malformed deliveries', () => {
    const failClosedCases = [
      null,
      undefined,
      {},
      { otherField: 'something' },
      { decision: 'maybe' },
      { decision: '' },
      { decision: 123 },
      { decision: true },
      { decision: false },
      { decision: ['approved'] },
      { decision: { status: 'approved' } },
      { postbackPayload: 'v1:invalid' },
      { postbackPayload: 'garbage-payload' },
      { quickReplyPayload: 999 },
      { callbackData: 'invalid_data' },
      { interactive: {} },
      { actions: [] },
      { actions: [{ value: 'invalid_val' }] },
    ];

    for (const item of failClosedCases) {
      const res = parseClickDelivery(item);
      expect(res.ok).toBe(false);
      expect(['missing', 'invalid']).toContain(res.reason);
    }
  });

  it('enforces expired delivery detection', () => {
    const expired1 = parseClickDelivery({ expired: true });
    expect(expired1).toEqual({ ok: false, reason: 'expired', received: { expired: true } });

    const expired2 = parseClickDelivery({ decision: 'expired' });
    expect(expired2).toEqual({ ok: false, reason: 'expired', received: { decision: 'expired' } });
  });

  it('preserves checkDecision compatibility with boolean ok and decision check', () => {
    expect(checkDecision({ decision: 'approved' })).toEqual({ ok: true, decision: 'approved' });
    expect(checkDecision({ decision: 'rejected' })).toEqual({ ok: true, decision: 'rejected' });
    expect(checkDecision({})).toEqual({ ok: false, reason: 'missing' });
    expect(checkDecision({ decision: 'foo' })).toEqual({ ok: false, reason: 'invalid', received: 'foo' });
    expect(checkDecision({ expired: true })).toEqual({ ok: false, reason: 'invalid', received: { expired: true } });
  });
});

describe('Target 3: Outbound Notification Builder', () => {
  it('generates exact Approve and Reject button specifications', () => {
    const token = 'tok_verify_buttons';
    const spec = buildNotifySpec(
      { summary: 'Deploy PR #42' },
      { channel: 'messaging', recipient: 'user_dev' },
      token,
    );

    expect(spec.recipient).toBe('user_dev');
    expect(spec.text).toBe('Deploy PR #42');
    expect(spec.buttons).toBeDefined();
    expect(spec.buttons).toHaveLength(2);

    const [btnApprove, btnReject] = spec.buttons!;
    expect(btnApprove).toEqual({
      type: 'postback',
      title: 'Approve',
      payload: 'v1:tok_verify_buttons:approved',
    });
    expect(btnReject).toEqual({
      type: 'postback',
      title: 'Reject',
      payload: 'v1:tok_verify_buttons:rejected',
    });
  });

  it('strictly respects text precedence and fallback defaults', () => {
    // 1. config.message has highest priority
    const spec1 = buildNotifySpec(
      { summary: 'Summary text' },
      { message: 'Custom config message', recipient: 'rec1' },
      't1',
    );
    expect(spec1.text).toBe('Custom config message');

    // 2. input.summary used when message is absent or whitespace
    const spec2 = buildNotifySpec(
      { summary: 'Summary text' },
      { message: '   ', recipient: 'rec2' },
      't2',
    );
    expect(spec2.text).toBe('Summary text');

    // 3. Fallback text when both are absent or whitespace
    const spec3 = buildNotifySpec(
      { summary: '   ' },
      { message: '', recipient: 'rec3' },
      't3',
    );
    expect(spec3.text).toBe('Approval requested');
  });

  it('omits recipient property when recipient is empty or missing', () => {
    const spec = buildNotifySpec({ summary: 'No recipient' }, { channel: 'messaging' }, 't_none');
    expect(spec.recipient).toBeUndefined();
    expect('recipient' in spec).toBe(false);
  });
});

describe('Target 4: Error Taxonomy Coverage (All 6 Error Codes)', () => {
  it('covers Code 1: INVALID_DECISION', () => {
    const err = new InvalidDecisionError('invalid_decision_reason', 'received_val');
    expect(err.code).toBe('INVALID_DECISION');
    expect(err.severity).toBe('error');
    expect(err.retryable).toBe(false);
    expect(err.details).toEqual({ reason: 'invalid_decision_reason', received: 'received_val' });
  });

  it('covers Code 2: APPROVAL_SEND_RATE_LIMITED (429, warn, retryable)', () => {
    const err429 = classifyMessagingTransportError({ status: 429, message: 'Too many requests' });
    expect(err429.code).toBe('APPROVAL_SEND_RATE_LIMITED');
    expect(err429.severity).toBe('warn');
    expect(err429.retryable).toBe(true);
    expect(err429.details?.httpStatus).toBe(429);

    const errByCode = classifyMessagingTransportError({ code: 'RATE_LIMITED', message: 'throttled' });
    expect(errByCode.code).toBe('APPROVAL_SEND_RATE_LIMITED');
    expect(errByCode.severity).toBe('warn');
    expect(errByCode.retryable).toBe(true);

    const errByMsg = classifyMessagingTransportError(new Error('Rate limit exceeded for endpoint'));
    expect(errByMsg.code).toBe('APPROVAL_SEND_RATE_LIMITED');
    expect(errByMsg.severity).toBe('warn');
    expect(errByMsg.retryable).toBe(true);
  });

  it('covers Code 3: APPROVAL_SEND_AUTH_REJECTED (401, 403, error, non-retryable)', () => {
    const err401 = classifyMessagingTransportError({ status: 401, message: 'Invalid token' });
    expect(err401.code).toBe('APPROVAL_SEND_AUTH_REJECTED');
    expect(err401.severity).toBe('error');
    expect(err401.retryable).toBe(false);

    const err403 = classifyMessagingTransportError({ status: 403, message: 'Access denied' });
    expect(err403.code).toBe('APPROVAL_SEND_AUTH_REJECTED');
    expect(err403.severity).toBe('error');
    expect(err403.retryable).toBe(false);

    const errCodeAuth = classifyMessagingTransportError({ code: 'AUTH_REJECTED', message: 'Bad creds' });
    expect(errCodeAuth.code).toBe('APPROVAL_SEND_AUTH_REJECTED');
  });

  it('covers Code 4: APPROVAL_RECIPIENT_UNREACHABLE (404, error, non-retryable)', () => {
    const err404 = classifyMessagingTransportError({ status: 404, message: 'User not found' });
    expect(err404.code).toBe('APPROVAL_RECIPIENT_UNREACHABLE');
    expect(err404.severity).toBe('error');
    expect(err404.retryable).toBe(false);

    const errRecipient = classifyMessagingTransportError(new Error('Recipient is unreachable or blocked'));
    expect(errRecipient.code).toBe('APPROVAL_RECIPIENT_UNREACHABLE');
    expect(errRecipient.severity).toBe('error');
    expect(errRecipient.retryable).toBe(false);
  });

  it('covers Code 5: APPROVAL_SEND_WINDOW_CLOSED (410, 422, error, non-retryable)', () => {
    const err410 = classifyMessagingTransportError({ status: 410, message: 'Messaging window expired' });
    expect(err410.code).toBe('APPROVAL_SEND_WINDOW_CLOSED');
    expect(err410.severity).toBe('error');
    expect(err410.retryable).toBe(false);

    const err422 = classifyMessagingTransportError({ status: 422, message: '24 hour window is closed' });
    expect(err422.code).toBe('APPROVAL_SEND_WINDOW_CLOSED');
    expect(err422.severity).toBe('error');
    expect(err422.retryable).toBe(false);
  });

  it('covers Code 6: APPROVAL_EXPIRED (error, non-retryable)', () => {
    const err = new ApprovalExpiredError({ expiredAt: '2026-08-29T12:00:00.000Z', timeoutHours: 24 });
    expect(err.code).toBe('APPROVAL_EXPIRED');
    expect(err.severity).toBe('error');
    expect(err.retryable).toBe(false);
    expect(err.details).toEqual({ expiredAt: '2026-08-29T12:00:00.000Z', timeoutHours: 24 });
  });
});

describe('Target 5: Runtime Op Execution & Transport Injection', () => {
  it('successfully handles resume delivery on runtime execute', async () => {
    const mockCtx = {
      instanceKey: 'approve_node',
      config: {},
      inputs: { summary: 'Approve PR' },
      delivery: {
        postbackPayload: 'v1:tok_123:approved',
        decidedBy: 'reviewer_1',
      },
      ok: vi.fn((ports) => ({ ok: true, ports })),
    } as unknown as NodeContext;

    const res = await executeOp(mockCtx);
    expect(mockCtx.ok).toHaveBeenCalledWith({
      decision: 'approved',
      decidedBy: 'reviewer_1',
      decidedVia: 'messaging',
    });
    expect(res).toEqual({
      ok: true,
      ports: {
        decision: 'approved',
        decidedBy: 'reviewer_1',
        decidedVia: 'messaging',
      },
    });
  });

  it('sends outbound notification when channel: "messaging" and ctx.services.messaging is provided', async () => {
    const sendMock = vi.fn().mockResolvedValue({ messageId: 'msg_999', status: 'sent' });
    const mockCtx = {
      instanceKey: 'approve_node',
      config: { channel: 'messaging', recipient: 'user_alice', message: 'Please review' },
      inputs: { summary: 'Approve PR' },
      delivery: undefined,
      services: {
        messaging: { send: sendMock },
      },
      ok: vi.fn((ports) => ({ ok: true, ports })),
    } as unknown as NodeContext;

    // First call without delivery should trigger outbound send and then fail-closed on missing delivery
    await expect(executeOp(mockCtx)).rejects.toThrow(InvalidDecisionError);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sendArg = sendMock.mock.calls[0][0];
    expect(sendArg.recipient).toBe('user_alice');
    expect(sendArg.text).toBe('Please review');
    expect(sendArg.buttons).toHaveLength(2);
  });

  it('maps transport failures to typed ApprovalError during outbound dispatch', async () => {
    const sendMock = vi.fn().mockRejectedValue({ status: 429, message: 'Too many requests' });
    const mockCtx = {
      instanceKey: 'approve_node',
      config: { channel: 'messaging', recipient: 'user_alice' },
      inputs: { summary: 'Approve PR' },
      delivery: undefined,
      services: {
        messaging: { send: sendMock },
      },
      ok: vi.fn((ports) => ({ ok: true, ports })),
    } as unknown as NodeContext;

    await expect(executeOp(mockCtx)).rejects.toThrow(ApprovalError);
    try {
      await executeOp(mockCtx);
    } catch (e) {
      const err = e as ApprovalError;
      expect(err.code).toBe('APPROVAL_SEND_RATE_LIMITED');
      expect(err.severity).toBe('warn');
      expect(err.retryable).toBe(true);
    }
  });

  it('throws ApprovalExpiredError on expired delivery', async () => {
    const mockCtx = {
      instanceKey: 'approve_node',
      config: {},
      inputs: {},
      delivery: { expired: true, expiredAt: '2026-08-29T10:00:00.000Z' },
      ok: vi.fn(),
    } as unknown as NodeContext;

    await expect(executeOp(mockCtx)).rejects.toThrow(ApprovalExpiredError);
  });
});

describe('Target 6: Zero Vendor Branding Verification', () => {
  it('manifest contains no vendor specific strings', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const packJson = fs.readFileSync(path.resolve(__dirname, '../pack.json'), 'utf8');

    const vendorPattern = /slack|teams|discord|zernio|twilio|whatsapp|telegram/i;
    expect(vendorPattern.test(packJson)).toBe(false);
  });

  it('source files contain no vendor specific strings', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const runtimeShape = fs.readFileSync(path.resolve(__dirname, '../runtime/approve.shape.ts'), 'utf8');
    const runtimeOp = fs.readFileSync(path.resolve(__dirname, '../runtime/approve.op.ts'), 'utf8');
    const deployStep = fs.readFileSync(path.resolve(__dirname, '../deploy/approve.step.ts'), 'utf8');

    const vendorPattern = /slack|teams|discord|zernio|twilio|whatsapp|telegram/i;
    expect(vendorPattern.test(runtimeShape)).toBe(false);
    expect(vendorPattern.test(runtimeOp)).toBe(false);
    expect(vendorPattern.test(deployStep)).toBe(false);
  });
});
