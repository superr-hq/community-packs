"use step";
/**
 * Deploy wiring ONLY (D01 §5) for the approval hook pattern:
 * 1. Resumes: normalizes delivered decision and provenance with embedded pure functions.
 * 2. Outbound notifications: dispatches interactive button spec via __superrMessagingClient.
 */

import type { MessagingClientPort, StepOutcome } from '@superr-hq/sdk';

declare const __superrShared_approve: {
  APPROVAL_DECISIONS: readonly ['approved', 'rejected'];
  buildNotifySpec(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    token: string,
  ): { recipient?: string; text: string; buttons?: unknown[] };
  isResumeDelivery(arg: unknown, config?: Record<string, unknown>): boolean;
  parseClickDelivery(delivery: unknown):
    | {
        ok: true;
        decision: 'approved' | 'rejected';
        token?: string;
        comment?: string;
        decidedBy?: string;
        decidedVia?: string;
      }
    | {
        ok: false;
        reason: string;
        received?: unknown;
      };
  classifyMessagingTransportError(err: unknown): {
    code: string;
    severity: 'warn' | 'error';
    retryable: boolean;
    message: string;
    details?: Record<string, unknown>;
  };
};

declare const __superrMessagingClient: MessagingClientPort | undefined;

type ApprovalOutcome = StepOutcome<{
  decision: string;
  comment?: string;
  decidedBy?: string;
  decidedVia?: string;
}>;

export async function execute(
  arg: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<ApprovalOutcome> {
  const shared = __superrShared_approve;
  const cfg = config ?? {};

  if (shared.isResumeDelivery(arg, cfg)) {
    const parsed = shared.parseClickDelivery(arg);
    if (!parsed.ok) {
      if (parsed.reason === 'expired') {
        return {
          ok: false,
          error: {
            code: 'APPROVAL_EXPIRED',
            message: 'The approval request has expired',
            details:
              typeof parsed.received === 'object' && parsed.received !== null
                ? (parsed.received as Record<string, unknown>)
                : {},
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'INVALID_DECISION',
          message: "resume decision must be exactly 'approved' or 'rejected'",
          details: {
            reason: parsed.reason,
            ...(parsed.received !== undefined ? { received: parsed.received } : {}),
          },
        },
      };
    }
    return {
      ok: true,
      ports: {
        decision: parsed.decision,
        ...(parsed.comment !== undefined ? { comment: parsed.comment } : {}),
        ...(parsed.decidedBy !== undefined ? { decidedBy: parsed.decidedBy } : {}),
        ...(parsed.decidedVia !== undefined ? { decidedVia: parsed.decidedVia } : {}),
      },
    };
  }

  if (cfg.channel === 'messaging') {
    const client =
      typeof __superrMessagingClient === 'object' && __superrMessagingClient !== null
        ? __superrMessagingClient
        : undefined;

    const token = 'tok_deploy';
    const spec = shared.buildNotifySpec(arg, cfg, token);

    if (client !== undefined && typeof client.send === 'function') {
      try {
        await client.send(spec as Parameters<typeof client.send>[0]);
      } catch (thrown) {
        const classified = shared.classifyMessagingTransportError(thrown);
        return {
          ok: false,
          error: {
            code: classified.code,
            message: classified.message,
            ...(classified.details !== undefined ? { details: classified.details } : {}),
          },
        };
      }
    }
  }

  const parsed = shared.parseClickDelivery(arg);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DECISION',
        message: "resume decision must be exactly 'approved' or 'rejected'",
        details: {
          reason: parsed.reason,
          ...(parsed.received !== undefined ? { received: parsed.received } : {}),
        },
      },
    };
  }
  return {
    ok: true,
    ports: {
      decision: parsed.decision,
      ...(parsed.comment !== undefined ? { comment: parsed.comment } : {}),
      ...(parsed.decidedBy !== undefined ? { decidedBy: parsed.decidedBy } : {}),
      ...(parsed.decidedVia !== undefined ? { decidedVia: parsed.decidedVia } : {}),
    },
  };
}
