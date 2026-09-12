/**
 * Local execution for `publish-post` (§4.2 runtime module contract).
 *
 * The transport is the host-injected social client (D01 §4: everything
 * impure arrives via ctx.services) — the same shared port every sibling
 * platform pack binds. This op composes the pure halves around one awaited
 * call and throws DECLARED errors only.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import { finishResponse, prepareRequest, transportMissingVerdict } from './publish-post.shape.js';
import type { PublishVerdict } from './publish-post.shape.js';

/** Thrown shape carrying the declared taxonomy entry verbatim. */
export class PublishError extends Error {
  readonly code: string;
  readonly severity: 'warn' | 'error';
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(verdict: Extract<PublishVerdict, { ok: false }>['error'] & { retryable: boolean }) {
    super(verdict.message);
    this.name = 'PublishError';
    this.code = verdict.code;
    // Transient failures (rate limit, provider 5xx) are warns; hard
    // validation/auth failures are errors. Retryability comes from the
    // declared classification, never guessed here.
    this.severity = verdict.retryable ? 'warn' : 'error';
    this.retryable = verdict.retryable;
    this.details = verdict.details ?? {};
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<StepResult<{ postId: string; postStatus: string }>> {
  // The shared social-client transport port — typed by @superr-hq/sdk
  // (`NodeServices.socialClient`); hosts inject it, fixtures swap it.
  const client = ctx.services?.socialClient;

  const prepared = prepareRequest(
    ctx.inputs as Parameters<typeof prepareRequest>[0],
    ctx.config as Parameters<typeof prepareRequest>[1],
  );
  if (!prepared.ok) throw new PublishError({ ...prepared.error, retryable: prepared.retryable });

  if (client === undefined || typeof client.request !== 'function') {
    throw new PublishError({ ...transportMissingVerdict().error, retryable: false });
  }

  let outcome: { thrown?: unknown; response?: { status: number; json?: unknown } };
  try {
    outcome = { response: await client.request(prepared.request) };
  } catch (thrown) {
    outcome = { thrown };
  }
  const verdict = finishResponse(outcome);
  if (!verdict.ok) throw new PublishError({ ...verdict.error, retryable: verdict.retryable });
  return ctx.ok(verdict.ports);
}
