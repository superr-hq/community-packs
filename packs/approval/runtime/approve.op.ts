/**
 * Local execution for `approve` (§4.2 runtime module contract, D01 §4).
 *
 * Hook semantics (D02 §5): the compiled HOOK primitive suspends the run and
 * this node's verdict materializes when a resume event arrives through the
 * control plane. When configured with `channel: "messaging"`, it dispatches
 * an outbound notification with interactive Approve/Reject buttons before suspending.
 */

import type { NodeContext, StepResult } from '@superr-hq/sdk';

import {
  buildNotifySpec,
  classifyMessagingTransportError,
  isResumeDelivery,
  parseClickDelivery,
  type ApprovalErrorCode,
} from './approve.shape.js';

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  readonly severity: 'warn' | 'error';
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(info: {
    code: ApprovalErrorCode;
    message: string;
    severity?: 'warn' | 'error';
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(info.message);
    this.name = 'ApprovalError';
    this.code = info.code;
    this.severity = info.severity ?? (info.code === 'APPROVAL_SEND_RATE_LIMITED' ? 'warn' : 'error');
    this.retryable = info.retryable ?? (info.code === 'APPROVAL_SEND_RATE_LIMITED');
    this.details = info.details ?? {};
  }
}

/** Declared in pack.json — severity error, non-retryable. */
export class InvalidDecisionError extends ApprovalError {
  constructor(reason: string, received?: unknown) {
    super({
      code: 'INVALID_DECISION',
      message: "resume decision must be exactly 'approved' or 'rejected'",
      severity: 'error',
      retryable: false,
      details: { reason, ...(received === undefined ? {} : { received }) },
    });
    this.name = 'InvalidDecisionError';
  }
}

/** Declared in pack.json — severity error, non-retryable. */
export class ApprovalExpiredError extends ApprovalError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'APPROVAL_EXPIRED',
      message: 'The approval request has expired',
      severity: 'error',
      retryable: false,
      details: details ?? {},
    });
    this.name = 'ApprovalExpiredError';
  }
}

export async function execute(
  ctx: NodeContext,
): Promise<
  StepResult<{
    decision: string;
    comment?: string;
    decidedBy?: string;
    decidedVia?: string;
  }>
> {
  const config = (ctx.config ?? {}) as Record<string, unknown>;
  const inputs = (ctx.inputs ?? {}) as { summary?: string } & Record<string, unknown>;

  // Check if this execution is processing a resume delivery (click / webhook)
  if (isResumeDelivery(ctx.delivery, config)) {
    const parsed = parseClickDelivery(ctx.delivery);
    if (!parsed.ok) {
      if (parsed.reason === 'expired') {
        throw new ApprovalExpiredError(
          typeof parsed.received === 'object' && parsed.received !== null
            ? (parsed.received as Record<string, unknown>)
            : undefined,
        );
      }
      throw new InvalidDecisionError(parsed.reason, parsed.received);
    }
    return ctx.ok({
      decision: parsed.decision,
      ...(parsed.comment !== undefined ? { comment: parsed.comment } : {}),
      ...(parsed.decidedBy !== undefined ? { decidedBy: parsed.decidedBy } : {}),
      ...(parsed.decidedVia !== undefined ? { decidedVia: parsed.decidedVia } : {}),
    });
  }

  // Outbound notification dispatch if channel is configured
  if (config.channel === 'messaging') {
    const messaging = ctx.services?.messaging;
    const token = `tok_${ctx.instanceKey}_${Date.now()}`;
    const spec = buildNotifySpec(inputs, config, token);

    if (messaging && typeof messaging.send === 'function') {
      try {
        await messaging.send(spec);
      } catch (thrown) {
        const classified = classifyMessagingTransportError(thrown);
        throw new ApprovalError(classified);
      }
    }
  }

  // If no delivery was provided on a pure resume node, fail closed
  const parsed = parseClickDelivery(ctx.delivery);
  if (!parsed.ok) {
    throw new InvalidDecisionError(parsed.reason, parsed.received);
  }
  return ctx.ok({
    decision: parsed.decision,
    ...(parsed.comment !== undefined ? { comment: parsed.comment } : {}),
    ...(parsed.decidedBy !== undefined ? { decidedBy: parsed.decidedBy } : {}),
    ...(parsed.decidedVia !== undefined ? { decidedVia: parsed.decidedVia } : {}),
  });
}
