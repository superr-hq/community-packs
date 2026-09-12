"use step";
/**
 * Deploy wiring ONLY (D01 §5): two pure embed calls with ONE awaited
 * transport invocation between them. The transport is the shared social
 * client port (`__superrSocialClient`) — identical across platform packs;
 * its STRUCTURE is the SDK's `SocialClientPort` contract.
 */

import type { SocialClientPort, StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_publish_post: {
  prepareRequest(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
  ):
    | {
        ok: true;
        request: {
          method: 'POST' | 'GET' | 'PATCH' | 'DELETE';
          path: string;
          body?: Record<string, unknown>;
        };
      }
    | {
        ok: false;
        error: { code: string; message: string; details?: Record<string, unknown> };
        retryable: boolean;
      };
  finishResponse(outcome: {
    thrown?: unknown;
    response?: { status: number; json?: unknown };
  }):
    | { ok: true; ports: { postId: string; postStatus: string } }
    | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };
  transportMissingVerdict(): {
    ok: false;
    error: { code: string; message: string };
  };
};

declare const __superrSocialClient: SocialClientPort | undefined;

type PublishOutcome = StepOutcome<{ postId: string; postStatus: string }>;

function outcomeOf(verdict: { ok: boolean } & Record<string, unknown>): PublishOutcome {
  if (verdict.ok) return { ok: true, ports: verdict.ports } as PublishOutcome;
  return { ok: false, error: verdict.error } as PublishOutcome;
}

export async function execute(
  input: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<PublishOutcome> {
  const shared = __superrShared_publish_post;
  const prepared = shared.prepareRequest(input, config);
  if (!prepared.ok) return outcomeOf(prepared);

  const client =
    typeof __superrSocialClient === 'object' && __superrSocialClient !== null
      ? __superrSocialClient
      : undefined;
  if (client === undefined || typeof client.request !== 'function') {
    return outcomeOf(shared.transportMissingVerdict());
  }

  try {
    const response = await client.request(prepared.request);
    return outcomeOf(shared.finishResponse({ response }));
  } catch (thrown) {
    return outcomeOf(shared.finishResponse({ thrown }));
  }
}
