import { createHmac, createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

// Unit checks for the pack's PURE integration layer. The pure crypto is
// cross-checked against node:crypto (dev-harness reference — the shipped
// embeds never touch it); the wire contracts pin request/response shapes.

import {
  hmacSha256,
  hmacSha256Hex,
  sha256,
  toHex,
  utf8Bytes,
  verifyHexSignature,
} from '../runtime/crypto.shape.js';
import {
  buildPublishRequest,
  classifyTransportStatus,
  extractPostId,
  isSubscribedType,
  normalizeEvent,
  parseEventBody,
  subscribedTypesOrAll,
} from '../runtime/api.shape.js';

// ── crypto ─────────────────────────────────────────────────────────────────

describe('crypto.shape', () => {
  it('matches RFC 4231 test case 1', () => {
    // Key = 0x0b repeated 20 times; data = "Hi There"
    const key = new Uint8Array(20).fill(0x0b);
    const data = utf8Bytes('Hi There');
    expect(toHex(hmacReference(key, data))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
    expect(toHex(hmacPack(key, data))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('matches RFC 4231 test case 2', () => {
    const key = utf8Bytes('Jefe');
    const data = utf8Bytes('what do ya want for nothing?');
    const expected = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843';
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(expected);
    expect(toHex(hmacPack(key, data))).toBe(expected);
  });

  it('hashes the classic fox vector like node:crypto', () => {
    expect(createHash('sha256').update('The quick brown fox jumps over the lazy dog').digest('hex')).toBe(
      toHex(sha256(utf8Bytes('The quick brown fox jumps over the lazy dog'))),
    );
  });

  it('agrees with node:crypto across block boundaries and multibyte text', () => {
    // Deterministic sweep: sizes straddling the 64-byte block edge, keys
    // short/long (>64 forces key hashing), payloads with 2–4 byte UTF-8.
    for (const size of [0, 1, 54, 55, 56, 63, 64, 65, 127, 128, 1000]) {
      const body = `${'x'.repeat(size)}—é🙂`;
      const secret = size % 2 === 0 ? 'short-key' : 'k'.repeat(131);
      expect(hmacSha256Hex(secret, body)).toBe(
        createHmac('sha256', secret).update(body, 'utf8').digest('hex'),
      );
    }
  });

  it('verifies signatures constant-tolerant of the sha256= prefix and rejects mismatches', () => {
    const mac = hmacSha256Hex('secret', 'body');
    expect(verifyHexSignature(mac, mac)).toBe(true);
    expect(verifyHexSignature(mac, `sha256=${mac}`)).toBe(true);
    expect(verifyHexSignature(mac, `SHA256=${mac.toUpperCase()}`)).toBe(false); // hex is lowercase-canonical
    expect(verifyHexSignature(mac, '0'.repeat(mac.length))).toBe(false);
    expect(verifyHexSignature(mac, mac.slice(0, -2))).toBe(false);
  });
});

function hmacReference(key: Uint8Array, data: Uint8Array): Uint8Array {
  return createHmac('sha256', Buffer.from(key)).update(Buffer.from(data)).digest();
}

function hmacPack(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmacSha256(key, data);
}

// ── wire contracts ─────────────────────────────────────────────────────────

describe('api.shape — publish requests', () => {
  it('pins the platform target and default publishNow', () => {
    const built = buildPublishRequest(
      { accountId: 'acc_ig_1', caption: 'Hello' },
      {},
    );
    if (!built.ok) throw new Error('expected ok build');
    expect(built.request).toEqual({
      method: 'POST',
      path: '/v1/posts',
      body: {
        content: 'Hello',
        platforms: [{ platform: 'instagram', accountId: 'acc_ig_1' }],
        publishNow: true,
      },
    });
  });

  it('carries media, scheduling, and first comment as platform-specific data', () => {
    const built = buildPublishRequest(
      { accountId: 'acc_ig_1', mediaUrls: ['https://cdn/a.jpg'] },
      { scheduledFor: '2026-09-01T10:00:00.000Z', firstComment: 'link in bio' },
    );
    if (!built.ok) throw new Error('expected ok build');
    expect(built.request.body).toMatchObject({
      mediaItems: [{ url: 'https://cdn/a.jpg' }],
      platforms: [
        { platform: 'instagram', accountId: 'acc_ig_1', platformSpecificData: { firstComment: 'link in bio' } },
      ],
      scheduledFor: '2026-09-01T10:00:00.000Z',
      publishNow: false,
    });
  });

  it('rejects junk inputs with typed reasons before any transport call', () => {
    expect(buildPublishRequest({}, {}).ok).toBe(false);
    expect(buildPublishRequest({ accountId: 'a' }, {}).ok).toBe(false);
    expect(buildPublishRequest({ accountId: 'a', mediaUrls: 42 }, { publishNow: true }).ok).toBe(false);
    expect(buildPublishRequest({ accountId: 'a', caption: 'x' }, { scheduledFor: 'soon' }).ok).toBe(false);
  });
});

describe('api.shape — responses and failures', () => {
  it('extracts post identity from response variants', () => {
    expect(extractPostId({ status: 200, json: { _id: 'p1', status: 'scheduled' } })).toEqual({
      postId: 'p1',
      status: 'scheduled',
    });
    expect(extractPostId({ status: 200, json: { id: 'p2' } }).postId).toBe('p2');
    expect(extractPostId({ status: 200 }).postId).toBeUndefined();
  });

  it('maps statuses onto the declared taxonomy with correct retryability', () => {
    expect(classifyTransportStatus(429)).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(classifyTransportStatus(401)).toMatchObject({ code: 'AUTH_REJECTED', retryable: false });
    expect(classifyTransportStatus(403)).toMatchObject({ code: 'AUTH_REJECTED', retryable: false });
    expect(classifyTransportStatus(400)).toMatchObject({ code: 'INVALID_POST_REQUEST', retryable: false });
    expect(classifyTransportStatus(500)).toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    expect(classifyTransportStatus(418)).toMatchObject({ code: 'PROVIDER_ERROR', retryable: false });
  });
});

describe('api.shape — events', () => {
  const commentBody = {
    id: 'evt_c1',
    event: 'comment.received',
    comment: {
      id: 'c_1',
      platform: 'instagram',
      platformPostId: 'ig_post_9',
      text: 'Love this!',
      author: { id: 'a_1', username: 'fanuser' },
      isReply: false,
    },
    account: { id: 'acc_ig_1', accountId: 'acc_ig_1', platform: 'instagram', username: 'brandco' },
  };

  it('normalizes instagram comments with provenance', () => {
    const normalized = normalizeEvent(commentBody);
    if (!normalized.ok) throw new Error('expected normalization');
    expect(normalized.event).toMatchObject({
      type: 'comment.received',
      id: 'evt_c1',
      accountId: 'acc_ig_1',
      username: 'brandco',
      text: 'Love this!',
      platformPostId: 'ig_post_9',
      isReply: false,
      author: { id: 'a_1', username: 'fanuser' },
    });
    expect(normalized.event.raw).toBe(commentBody);
  });

  it('gates sibling-platform traffic as foreign_platform', () => {
    const facebookComment = structuredClone(commentBody) as Record<string, unknown>;
    ((facebookComment.comment as Record<string, unknown>).platform as unknown) = 'facebook';
    ((facebookComment.account as Record<string, unknown>).platform as unknown) = 'facebook';
    expect(normalizeEvent(facebookComment)).toEqual({ ok: false, reason: 'foreign_platform' });
  });

  it('requires an event kind and honors subscription config defaults', () => {
    expect(normalizeEvent({ hello: true })).toEqual({ ok: false, reason: 'missing_event_kind' });
    expect(parseEventBody({ rawBody: '[1]' })).toEqual({ ok: false, reason: 'not_object' });

    expect(subscribedTypesOrAll({})).toContain('comment.received'); // default all
    expect(subscribedTypesOrAll({ eventTypes: ['message.received'] })).toEqual(['message.received']);
    expect(isSubscribedType('message.received', subscribedTypesOrAll({ eventTypes: ['message.received'] }))).toBe(true);
    expect(isSubscribedType('comment.received', subscribedTypesOrAll({ eventTypes: ['message.received'] }))).toBe(false);
  });
});
