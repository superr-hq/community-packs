/**
 * Pure shaping logic for the `publish-post` action (§4.2). Every DECISION —
 * request building, verdict extraction, failure classification — is pure and
 * lives here / in the shared integration layer (`./api.shape.js`); the
 * deploy wiring only orchestrates the injected transport call between two
 * pure embed calls.
 */

import {
  buildPublishRequest,
  classifyTransportStatus,
  extractPostId,
} from './api.shape.js';
import type {
  PublishConfig,
  PublishInput,
  SocialClientRequest,
  SocialClientResponse,
} from './api.shape.js';

/** A fully-shaped publish verdict before envelope assembly. */
export type PublishVerdict =
  | { ok: true; ports: { postId: string; postStatus: string } }
  | {
      ok: false;
      error: { code: string; message: string; details?: Record<string, unknown> };
      /** Declared retryability — surfaces on the failed envelope meta. */
      retryable: boolean;
    };

/** The failure arm of a verdict — what prepareRequest returns instead of a request. */
export type PrepareFailure = Extract<PublishVerdict, { ok: false }>;

const BUILD_FAILURES: Record<string, { code: string; message: string }> = {
  missing_account_id: { code: 'MISSING_ACCOUNT_ID', message: 'a facebook page id is required' },
  nothing_to_publish: { code: 'INVALID_POST_REQUEST', message: 'provide a caption or at least one media URL' },
  bad_media_urls: { code: 'INVALID_POST_REQUEST', message: 'mediaUrls must be an array of URL strings' },
  bad_scheduled_for: { code: 'INVALID_POST_REQUEST', message: 'scheduledFor must be a parseable ISO instant' },
};

/** Pure half one: input/config → request spec, or a declared failure. */
export function prepareRequest(
  input: PublishInput,
  config: PublishConfig,
): { ok: true; request: SocialClientRequest } | PrepareFailure {
  const built = buildPublishRequest(input, config);
  if (built.ok) return built;
  const declared =
    BUILD_FAILURES[built.reason] ?? { code: 'INVALID_POST_REQUEST', message: 'publish request could not be built' };
  return {
    ok: false,
    retryable: false,
    error: { code: declared.code, message: declared.message, details: { reason: built.reason } },
  };
}

/**
 * Pure half three: transport outcome → verdict. A thrown transport maps to
 * PROVIDER_ERROR/retryable (transient by definition); non-2xx statuses go
 * through the shared taxonomy.
 */
export function finishResponse(outcome: { thrown?: unknown; response?: SocialClientResponse }): PublishVerdict {
  if (outcome.thrown !== undefined) {
    return {
      ok: false,
      retryable: true,
      error: {
        code: 'PROVIDER_ERROR',
        message: outcome.thrown instanceof Error ? outcome.thrown.message : String(outcome.thrown),
      },
    };
  }
  const response = outcome.response!;
  if (response.status < 200 || response.status >= 300) {
    const failure = classifyTransportStatus(response.status);
    return {
      ok: false,
      retryable: failure.retryable,
      error: {
        code: failure.code,
        message: failure.message,
        ...(response.status >= 400 ? { details: { httpStatus: response.status } } : {}),
      },
    };
  }
  const extracted = extractPostId(response);
  return { ok: true, ports: { postId: extracted.postId ?? '', postStatus: extracted.status ?? '' } };
}

/** Missing host transport — a wiring breach that must fail loudly. */
export function transportMissingVerdict(): PrepareFailure {
  return {
    ok: false,
    retryable: false,
    error: {
      code: 'TRANSPORT_UNAVAILABLE',
      message: 'no social client is bound to this execution (host wiring missing)',
    },
  };
}
