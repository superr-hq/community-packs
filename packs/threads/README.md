# threads

Threads triggers and actions — one platform pack in a family of sibling
platform packs that all follow the SAME pattern: identical transport port
(`__superrSocialClient`), identical `"use step"` wiring convention, identical
error taxonomy shape; only platform keys and event vocabularies differ.

## Nodes

- **`events`** (trigger, protocol `social.threads`) — receives webhook
  deliveries over HMAC-SHA256-authenticated HTTP (`x-social-signature`, hex,
  `sha256=` prefix tolerated). Normalizes replies on posts, post lifecycle,
  and account lifecycle into one `event` port with lossless `raw`
  provenance. Platform discrimination is a typed gate (`foreign_platform`):
  one shared backend webhook never leaks sibling-platform traffic here.
  `eventTypes` subscribes explicitly; unset subscribes to everything this
  pack consumes.
- **`publish-post`** (action) — creates a Threads post through the shared
  social client: text and/or media, optional scheduling, and Threads-specific
  data (topic tag, thread chain via `threadItems`) as platform-specific data
  on the target entry. Transport failures map onto the declared taxonomy
  (`RATE_LIMITED` retryable, `AUTH_REJECTED` fatal, …); a missing client
  binding fails loudly.

## Layout

Per §4.2: pure `runtime/*.shape.ts` modules (hermetic embeds, including a
self-contained SHA-256/HMAC pinned against RFC 4231 vectors), local-execution
`runtime/*.op.ts`, wiring-only `deploy/*.step.ts`, the pack's ingress adapter
in `runtime/ingress-adapter.ts` (structural twin of the kernel surface —
registration sites pass it to `registerProtocol('social.threads', …)`),
and a fixture corpus per node covering every declared error code plus skip
codes and port-level expectations.
