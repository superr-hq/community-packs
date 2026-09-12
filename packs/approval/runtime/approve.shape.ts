/**
 * Pure shaping logic for `approve` (§4.2: the mandatory parity source).
 * Dependency-free by contract — bundled into a hermetic IIFE embed.
 *
 * These shapes define both halves of the approval hook:
 *  1. Outbound notification specification (buildNotifySpec, compact token codec)
 *  2. Resume / click delivery parsing (parseClickDelivery, checkDecision) fail-closed.
 */

import type { MessagingButton, MessagingSendRequest } from '@superr-hq/sdk';

export const APPROVAL_DECISIONS = ['approved', 'rejected'] as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export interface ResumeDelivery {
  decision?: unknown;
  comment?: unknown;
  decidedBy?: unknown;
  decidedVia?: unknown;
  postbackPayload?: unknown;
  quickReplyPayload?: unknown;
  callbackData?: unknown;
  buttonPayload?: unknown;
  interactiveId?: unknown;
  payload?: unknown;
  expired?: unknown;
  [key: string]: unknown;
}

export type DecisionCheck =
  | { ok: true; decision: ApprovalDecision }
  | { ok: false; reason: 'missing' | 'invalid'; received?: unknown };

export type ParsedClickDelivery =
  | {
      ok: true;
      decision: ApprovalDecision;
      token?: string;
      comment?: string;
      decidedBy?: string;
      decidedVia?: string;
    }
  | {
      ok: false;
      reason: 'missing' | 'invalid' | 'expired';
      received?: unknown;
    };

/**
 * Compact approval token codec (guaranteed <= 64 bytes for platform limits).
 * Format: `v1:<token>:<decision>`
 */
export function encodeApprovalPayload(token: string, decision: ApprovalDecision): string {
  const cleanToken = token.trim();
  const cleanDecision = decision.trim().toLowerCase();
  return `v1:${cleanToken}:${cleanDecision}`;
}

export function decodeApprovalPayload(
  payload: unknown,
): { ok: true; token: string; decision: ApprovalDecision } | { ok: false; reason: string } {
  if (typeof payload !== 'string' || payload.trim() === '') {
    return { ok: false, reason: 'payload_not_string' };
  }
  const trimmed = payload.trim();
  const parts = trimmed.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return { ok: false, reason: 'invalid_format' };
  }
  const token = parts[1];
  const decision = parts[2]?.toLowerCase();
  if (!token || token === '') {
    return { ok: false, reason: 'missing_token' };
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, reason: 'invalid_decision' };
  }
  return { ok: true, token, decision: decision as ApprovalDecision };
}

/**
 * Build outbound vendor-neutral notification specification with Approve/Reject interactive buttons.
 */
export function buildNotifySpec(
  input: { summary?: string } & Record<string, unknown>,
  config: { channel?: string; recipient?: string; message?: string } & Record<string, unknown>,
  token: string,
): MessagingSendRequest {
  const text =
    optionalText(config.message) ??
    optionalText(input.summary) ??
    'Approval requested';

  const recipient = optionalText(config.recipient);

  const buttons: MessagingButton[] = [
    {
      type: 'postback',
      title: 'Approve',
      payload: encodeApprovalPayload(token, 'approved'),
    },
    {
      type: 'postback',
      title: 'Reject',
      payload: encodeApprovalPayload(token, 'rejected'),
    },
  ];

  return {
    ...(recipient !== undefined ? { recipient } : {}),
    text,
    buttons,
  };
}

/**
 * Check if the execution argument is a resume delivery or outbound input.
 */
export function isResumeDelivery(arg: unknown, config?: Record<string, unknown>): boolean {
  if (arg === null || arg === undefined || typeof arg !== 'object') {
    return false;
  }
  const record = arg as Record<string, unknown>;
  if (
    'decision' in record ||
    'postbackPayload' in record ||
    'quickReplyPayload' in record ||
    'callbackData' in record ||
    'buttonPayload' in record ||
    'interactiveId' in record ||
    'interactive' in record ||
    'expired' in record
  ) {
    return true;
  }
  if (config?.channel !== 'messaging') {
    return true;
  }
  return false;
}

/**
 * Normalize and parse a multi-platform click or webhook delivery payload fail-closed.
 */
export function parseClickDelivery(delivery: unknown): ParsedClickDelivery {
  if (delivery === null || delivery === undefined || typeof delivery !== 'object') {
    return { ok: false, reason: 'missing' };
  }

  const record = delivery as Record<string, unknown>;

  if (record.expired === true || record.decision === 'expired') {
    return { ok: false, reason: 'expired', received: record };
  }

  // 1. Direct explicit decision field
  if ('decision' in record) {
    const raw = record.decision;
    if (typeof raw !== 'string') {
      return { ok: false, reason: 'invalid', received: raw };
    }
    const normalized = raw.trim().toLowerCase();
    if (!(APPROVAL_DECISIONS as readonly string[]).includes(normalized)) {
      return { ok: false, reason: 'invalid', received: raw };
    }
    const comment = optionalText(record.comment);
    const decidedBy = optionalText(record.decidedBy);
    const decidedVia = optionalText(record.decidedVia);
    return {
      ok: true,
      decision: normalized as ApprovalDecision,
      ...(comment !== undefined ? { comment } : {}),
      ...(decidedBy !== undefined ? { decidedBy } : {}),
      ...(decidedVia !== undefined ? { decidedVia } : {}),
    };
  }

  // 2. Extract payload string from interactive delivery formats
  let payloadStr: string | undefined;

  if (typeof record.postbackPayload === 'string') {
    payloadStr = record.postbackPayload;
  } else if (typeof record.quickReplyPayload === 'string') {
    payloadStr = record.quickReplyPayload;
  } else if (typeof record.callbackData === 'string') {
    payloadStr = record.callbackData;
  } else if (typeof record.buttonPayload === 'string') {
    payloadStr = record.buttonPayload;
  } else if (typeof record.interactiveId === 'string') {
    payloadStr = record.interactiveId;
  } else if (typeof record.payload === 'string') {
    payloadStr = record.payload;
  } else if (typeof record.postback === 'object' && record.postback !== null) {
    const pb = record.postback as Record<string, unknown>;
    if (typeof pb.payload === 'string') payloadStr = pb.payload;
  } else if (typeof record.quick_reply === 'object' && record.quick_reply !== null) {
    const qr = record.quick_reply as Record<string, unknown>;
    if (typeof qr.payload === 'string') payloadStr = qr.payload;
  } else if (typeof record.interactive === 'object' && record.interactive !== null) {
    const inter = record.interactive as Record<string, unknown>;
    const btn = inter.button_reply as Record<string, unknown> | undefined;
    const list = inter.list_reply as Record<string, unknown> | undefined;
    if (typeof btn?.id === 'string') payloadStr = btn.id;
    else if (typeof list?.id === 'string') payloadStr = list.id;
  } else if (Array.isArray(record.actions) && record.actions.length > 0) {
    const first = record.actions[0] as Record<string, unknown>;
    if (typeof first.value === 'string') payloadStr = first.value;
  }

  if (payloadStr !== undefined) {
    const decoded = decodeApprovalPayload(payloadStr);
    if (decoded.ok) {
      const comment =
        optionalText(record.comment) ??
        optionalText(record.note);
      const decidedBy =
        optionalText(record.decidedBy) ??
        optionalText((record.user as Record<string, unknown>)?.name) ??
        optionalText((record.user as Record<string, unknown>)?.id) ??
        optionalText((record.from as Record<string, unknown>)?.name) ??
        optionalText((record.from as Record<string, unknown>)?.id) ??
        optionalText((record.sender as Record<string, unknown>)?.id);
      const decidedVia =
        optionalText(record.decidedVia) ??
        optionalText(record.channel) ??
        optionalText(record.source) ??
        optionalText(record.platform) ??
        optionalText(record.via) ??
        'messaging';

      return {
        ok: true,
        decision: decoded.decision,
        token: decoded.token,
        ...(comment !== undefined ? { comment } : {}),
        ...(decidedBy !== undefined ? { decidedBy } : {}),
        ...(decidedVia !== undefined ? { decidedVia } : {}),
      };
    }

    // Direct fallback if raw payload string is simply 'approved' or 'rejected'
    const rawLower = payloadStr.trim().toLowerCase();
    if ((APPROVAL_DECISIONS as readonly string[]).includes(rawLower)) {
      const comment = optionalText(record.comment);
      const decidedBy = optionalText(record.decidedBy);
      const decidedVia = optionalText(record.decidedVia) ?? 'messaging';
      return {
        ok: true,
        decision: rawLower as ApprovalDecision,
        ...(comment !== undefined ? { comment } : {}),
        ...(decidedBy !== undefined ? { decidedBy } : {}),
        ...(decidedVia !== undefined ? { decidedVia } : {}),
      };
    }

    return { ok: false, reason: 'invalid', received: payloadStr };
  }

  return { ok: false, reason: 'missing' };
}

/**
 * Check decision helper for backward compatibility.
 */
export function checkDecision(delivery: unknown): DecisionCheck {
  const parsed = parseClickDelivery(delivery);
  if (parsed.ok) {
    return { ok: true, decision: parsed.decision };
  }
  return {
    ok: false,
    reason: parsed.reason === 'expired' ? 'invalid' : parsed.reason,
    ...(parsed.received !== undefined ? { received: parsed.received } : {}),
  };
}

/** Optional strings pass through trimmed; junk becomes undefined. */
export function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Expiry instant for the configured timeout window, from a pinned `now`.
 * Absent config ⇒ the hook waits indefinitely (the kernel owns the wait).
 */
export function expiryIso(timeoutHours: unknown, nowMs: number): string | undefined {
  if (timeoutHours === undefined || timeoutHours === null) return undefined;
  if (typeof timeoutHours !== 'number' || !Number.isFinite(timeoutHours) || timeoutHours <= 0) {
    return undefined;
  }
  return new Date(nowMs + timeoutHours * 3_600_000).toISOString();
}

export type ApprovalErrorCode =
  | 'INVALID_DECISION'
  | 'APPROVAL_SEND_RATE_LIMITED'
  | 'APPROVAL_SEND_AUTH_REJECTED'
  | 'APPROVAL_RECIPIENT_UNREACHABLE'
  | 'APPROVAL_SEND_WINDOW_CLOSED'
  | 'APPROVAL_EXPIRED';

export function classifyMessagingTransportError(err: unknown): {
  code: ApprovalErrorCode;
  severity: 'warn' | 'error';
  retryable: boolean;
  message: string;
  details?: Record<string, unknown>;
} {
  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as Record<string, unknown>).status === 'number'
      ? ((err as Record<string, unknown>).status as number)
      : undefined;

  const errCode =
    typeof err === 'object' && err !== null && 'code' in err && typeof (err as Record<string, unknown>).code === 'string'
      ? ((err as Record<string, unknown>).code as string)
      : undefined;

  const errMsg = err instanceof Error ? err.message : String(err ?? '');
  const lowerMsg = errMsg.toLowerCase();

  if (status === 429 || errCode === 'RATE_LIMITED' || lowerMsg.includes('rate limit')) {
    return {
      code: 'APPROVAL_SEND_RATE_LIMITED',
      severity: 'warn',
      retryable: true,
      message: 'Messaging transport rate limited outbound notification',
      details: {
        reason: errMsg,
        ...(status !== undefined ? { httpStatus: status } : {}),
      },
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    errCode === 'AUTH_REJECTED' ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('permission')
  ) {
    return {
      code: 'APPROVAL_SEND_AUTH_REJECTED',
      severity: 'error',
      retryable: false,
      message: 'Messaging transport authentication or permissions rejected',
      details: { reason: errMsg },
    };
  }

  if (
    status === 404 ||
    errCode === 'RECIPIENT_UNREACHABLE' ||
    lowerMsg.includes('recipient') ||
    lowerMsg.includes('unreachable') ||
    lowerMsg.includes('not found')
  ) {
    return {
      code: 'APPROVAL_RECIPIENT_UNREACHABLE',
      severity: 'error',
      retryable: false,
      message: 'Specified recipient or conversation is unreachable',
      details: { reason: errMsg },
    };
  }

  if (
    status === 410 ||
    status === 422 ||
    errCode === 'WINDOW_CLOSED' ||
    lowerMsg.includes('window')
  ) {
    return {
      code: 'APPROVAL_SEND_WINDOW_CLOSED',
      severity: 'error',
      retryable: false,
      message: 'Outbound messaging window is closed',
      details: { reason: errMsg },
    };
  }

  return {
    code: 'APPROVAL_SEND_AUTH_REJECTED',
    severity: 'error',
    retryable: false,
    message: errMsg || 'Messaging transport failed',
    details: { reason: errMsg },
  };
}
