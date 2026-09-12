/**
 * Shared wire contracts for the threads pack — the ONE integration layer
 * every node (and the ingress adapter) shapes through, and the exact pattern
 * the sibling platform packs repeat: same transport port, same request
 * conventions, same error taxonomy; only platform keys differ.
 *
 * Pure by contract: request BUILDING and response/error CLASSIFICATION live
 * here; the transport call itself is wiring (`__superrSocialClient.request`),
 * injected by the host so embeds stay hermetic and fixtures swap providers.
 * The transport spec/response STRUCTURE is the SDK's `SocialClientPort`
 * contract (type-only import — erased before bundling, embeds stay pure).
 */

import type {
  SocialClientRequest,
  SocialClientResponse,
} from '@superr-hq/sdk';

import { verifyHexSignature } from './crypto.shape.js';

// ── Signature verification (trigger authn) ─────────────────────────────────

export const SIGNATURE_HEADER = 'x-social-signature';

export { verifyHexSignature };

// ── Event vocabulary ───────────────────────────────────────────────────────

/**
 * The event types a threads workflow can subscribe to: replies on posts,
 * post lifecycle, and account lifecycle.
 */
export const EVENT_TYPES = [
  'comment.received',
  'post.published',
  'post.failed',
  'account.connected',
  'account.disconnected',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isSubscribedType(type: string, subscribed: readonly unknown[]): boolean {
  return subscribed.includes(type);
}

/**
 * Subscription reader with default-ALL semantics: an unset/empty
 * `eventTypes` config subscribes to everything this pack consumes (the same
 * rule for the ingress adapter gate and the node step).
 */
export function subscribedTypesOrAll(config: Record<string, unknown>): string[] {
  const declared = config.eventTypes;
  if (
    Array.isArray(declared) &&
    declared.length > 0 &&
    declared.every((entry) => typeof entry === 'string')
  ) {
    return declared as string[];
  }
  return [...EVENT_TYPES];
}

// ── Delivery parsing + normalization ───────────────────────────────────────

export interface SocialDelivery {
  rawBody?: unknown;
}

export type BodyParse =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: 'malformed_json' | 'not_object' };

export function parseEventBody(delivery: SocialDelivery | null | undefined): BodyParse {
  const raw = delivery?.rawBody;
  if (typeof raw !== 'string') return { ok: false, reason: 'malformed_json' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: 'not_object' };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, reason: 'malformed_json' };
  }
}

/** The normalized social event carried on the trigger's `event` port. */
export interface SocialEvent {
  /** Backend event kind, e.g. `comment.received`. */
  type: string;
  /** Stable backend event id (dedupe + delivery-log correlation). */
  id?: string | undefined;
  /** Account the event belongs to. */
  accountId?: string | undefined;
  username?: string | undefined;
  text?: string | undefined;
  platformPostId?: string | undefined;
  isReply?: boolean | undefined;
  author?: { id?: string | undefined; username?: string | undefined; name?: string | undefined };
  /** Full original payload — lossless provenance. */
  raw: Record<string, unknown>;
}

export type EventNormalize =
  | { ok: true; event: SocialEvent }
  | { ok: false; reason: 'missing_event_kind' | 'foreign_platform' };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Normalize one delivery body. Platform discrimination is a GATE: comment
 * payloads carry a backend platform discriminator, and anything not
 * addressed to this pack's platform is rejected as `foreign_platform` —
 * one shared backend webhook must never leak sibling-platform traffic into
 * a threads workflow.
 */
export function normalizeEvent(body: Record<string, unknown>): EventNormalize {
  const type = optionalText(body.event);
  if (type === undefined) return { ok: false, reason: 'missing_event_kind' };

  if (type === 'comment.received') {
    const comment = asRecord(body.comment);
    if (comment?.platform !== undefined && comment.platform !== 'threads') {
      return { ok: false, reason: 'foreign_platform' };
    }
    const author = asRecord(comment?.author);
    const post = asRecord(body.post);
    const account = asRecord(body.account);
    return {
      ok: true,
      event: {
        type,
        id: optionalText(body.id),
        accountId: optionalText(account?.accountId ?? account?.id),
        username: optionalText(account?.username),
        text: optionalText(comment?.text),
        platformPostId: optionalText(post?.platformPostId ?? comment?.platformPostId),
        isReply: comment?.isReply === true,
        ...(author === undefined
          ? {}
          : {
              author: {
                id: optionalText(author.id),
                username: optionalText(author.username),
                name: optionalText(author.name),
              },
            }),
        raw: body,
      },
    };
  }

  // Post lifecycle + account lifecycle events carry no cross-platform
  // discriminator beyond their account/post records — normalize as-is.
  const account = asRecord(body.account);
  return {
    ok: true,
    event: {
      type,
      id: optionalText(body.id),
      accountId: optionalText(account?.accountId ?? account?.id),
      username: optionalText(account?.username),
      raw: body,
    },
  };
}

// ── Publish requests (transport port contract) ─────────────────────────────

/**
 * The transport STRUCTURE (`SocialClientRequest`/`SocialClientResponse`) is
 * the SDK's shared social-client port contract; hosts inject the client, and
 * every platform pack builds specs against these exact shapes.
 */
export type { SocialClientRequest, SocialClientResponse };

export interface PublishInput {
  accountId?: unknown;
  caption?: unknown;
  mediaUrls?: unknown;
}

export interface PublishConfig {
  publishNow?: unknown;
  scheduledFor?: unknown;
  topic_tag?: unknown;
  threadItems?: unknown;
}

export type PublishRequestBuild =
  | { ok: true; request: SocialClientRequest }
  | {
      ok: false;
      reason:
        | 'missing_account_id'
        | 'nothing_to_publish'
        | 'bad_media_urls'
        | 'bad_scheduled_for'
        | 'bad_topic_tag'
        | 'bad_thread_items';
    };

/**
 * A thread chain entry: at minimum `{ text }`; the backend tolerates extra
 * per-item fields (media, links) and passes them through verbatim.
 */
export type ThreadItem = Record<string, unknown>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isThreadItemArray(value: unknown): value is ThreadItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    )
  );
}

/**
 * Build the create-post request for THIS platform only: the target entry is
 * pinned to the platform key so a miswired account can never fan out to a
 * different network. Threads-specific data travels on the target entry:
 * an optional topic tag and an optional thread chain (`threadItems`).
 */
export function buildPublishRequest(
  input: PublishInput,
  config: PublishConfig,
): PublishRequestBuild {
  if (typeof input.accountId !== 'string' || input.accountId.trim() === '') {
    return { ok: false, reason: 'missing_account_id' };
  }
  const hasCaption = typeof input.caption === 'string' && input.caption.trim() !== '';
  const hasMedia =
    input.mediaUrls === undefined ||
    (isStringArray(input.mediaUrls) && input.mediaUrls.length > 0);
  if (input.mediaUrls !== undefined && !isStringArray(input.mediaUrls)) {
    return { ok: false, reason: 'bad_media_urls' };
  }
  if (!hasCaption && (!hasMedia || input.mediaUrls === undefined)) {
    return { ok: false, reason: 'nothing_to_publish' };
  }
  let scheduledFor: string | undefined;
  if (config.scheduledFor !== undefined && config.scheduledFor !== null) {
    if (
      typeof config.scheduledFor !== 'string' ||
      Number.isNaN(Date.parse(config.scheduledFor))
    ) {
      return { ok: false, reason: 'bad_scheduled_for' };
    }
    scheduledFor = config.scheduledFor;
  }
  let topicTag: string | undefined;
  if (config.topic_tag !== undefined && config.topic_tag !== null) {
    if (typeof config.topic_tag !== 'string' || config.topic_tag.trim() === '') {
      return { ok: false, reason: 'bad_topic_tag' };
    }
    topicTag = config.topic_tag;
  }
  let threadItems: ThreadItem[] | undefined;
  if (config.threadItems !== undefined && config.threadItems !== null) {
    if (!isThreadItemArray(config.threadItems)) {
      return { ok: false, reason: 'bad_thread_items' };
    }
    threadItems = config.threadItems;
  }
  const publishNow = scheduledFor === undefined && config.publishNow !== false;

  const mediaItems =
    isStringArray(input.mediaUrls) && input.mediaUrls.length > 0
      ? input.mediaUrls.map((url) => ({ url }))
      : undefined;
  const threadsData: Record<string, unknown> = {
    ...(topicTag === undefined ? {} : { topic_tag: topicTag }),
    ...(threadItems === undefined ? {} : { threadItems }),
  };
  const hasPlatformData = Object.keys(threadsData).length > 0;

  return {
    ok: true,
    request: {
      method: 'POST',
      path: '/v1/posts',
      body: {
        ...(typeof input.caption === 'string' ? { content: input.caption } : {}),
        ...(mediaItems === undefined ? {} : { mediaItems }),
        platforms: [
          {
            platform: 'threads',
            accountId: input.accountId,
            ...(hasPlatformData ? { platformSpecificData: threadsData } : {}),
          },
        ],
        ...(scheduledFor === undefined ? {} : { scheduledFor }),
        publishNow,
      },
    },
  };
}

// ── Transport failure taxonomy ─────────────────────────────────────────────

/** Declared transport-failure codes (mirrors the client SDK's classes). */
export interface TransportFailure {
  code:
    | 'RATE_LIMITED'
    | 'AUTH_REJECTED'
    | 'INVALID_POST_REQUEST'
    | 'PROVIDER_ERROR';
  retryable: boolean;
  message: string;
}

/**
 * Map a transport status onto the declared taxonomy. Retryability follows
 * the semantics of the underlying API errors: 429 and 5xx are transient,
 * auth/validation failures are not.
 */
export function classifyTransportStatus(status: number): TransportFailure {
  if (status === 429) {
    return { code: 'RATE_LIMITED', retryable: true, message: 'publish rate limited; back off and retry' };
  }
  if (status === 401 || status === 403) {
    return { code: 'AUTH_REJECTED', retryable: false, message: 'the social account rejected these credentials' };
  }
  if (status === 400 || status === 404 || status === 422) {
    return { code: 'INVALID_POST_REQUEST', retryable: false, message: 'the publish request was rejected as invalid' };
  }
  return status >= 500
    ? { code: 'PROVIDER_ERROR', retryable: true, message: 'the publishing service failed; retry may succeed' }
    : { code: 'PROVIDER_ERROR', retryable: false, message: 'unexpected response from the publishing service' };
}

/** Extract the created post's identity from a successful response. */
export function extractPostId(
  response: SocialClientResponse,
): { postId?: string | undefined; status?: string | undefined } {
  const body = asRecord(response.json);
  const postId = optionalText(body?._id ?? body?.id ?? body?.postId);
  const status = optionalText(body?.status);
  return { postId, status };
}
