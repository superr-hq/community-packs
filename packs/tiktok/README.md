# tiktok

TikTok triggers and actions — one platform pack in a family of sibling
platform packs that all follow the SAME pattern: identical transport port
(`__superrSocialClient`), identical `"use step"` wiring convention, identical
error taxonomy shape; only platform keys and event vocabularies differ.

## Nodes

- **`events`** (trigger, protocol `social.tiktok`) — receives webhook
  deliveries over HMAC-SHA256-authenticated HTTP (`x-social-signature`, hex,
  `sha256=` prefix tolerated). Normalizes video comments, post lifecycle
  (including TikTok's `post.tiktok.url_resolved`, which carries the uploaded
  video's canonical URL), and account lifecycle into one `event` port with
  lossless `raw` provenance. Platform discrimination is a typed gate
  (`foreign_platform`): one shared backend webhook never leaks
  sibling-platform traffic here. `eventTypes` subscribes explicitly; unset
  subscribes to everything this pack consumes.
- **`publish-post`** (action) — creates a TikTok post through the shared
  social client: caption and/or media, optional scheduling, and TikTok's
  creator controls (`privacyLevel`, comment/duet/stitch permissions,
  Creator-Inbox draft mode) as platform-specific data. Transport failures map
  onto the declared taxonomy (`RATE_LIMITED` retryable, `AUTH_REJECTED`
  fatal, …); a missing client binding fails loudly.

## Layout

Per §4.2: pure `runtime/*.shape.ts` modules (hermetic embeds, including a
self-contained SHA-256/HMAC pinned against RFC 4231 vectors), local-execution
`runtime/*.op.ts`, wiring-only `deploy/*.step.ts`, the pack's ingress adapter
in `runtime/ingress-adapter.ts` (structural twin of the kernel surface —
registration sites pass it to `registerProtocol('social.tiktok', …)`),
and a fixture corpus per node covering every declared error code plus skip
codes and port-level expectations.
