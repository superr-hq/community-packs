# http

Generic JSON-over-HTTP webhook ingress. One node:

- `webhook-http` — trigger speaking the kernel's built-in `http.api`
  protocol. The instance's `path` config IS the route claim
  (`fallbackForbidden: true`: an unset path is a validation failure, never a
  default). Deliveries hit `/api/webhooks/<path>`; the body (object or
  array) passes verbatim to the `body` port, and a string `type` field on an
  object body becomes the event kind for delivery-log provenance.

Strict ingress is kernel mechanics: exact route match (no fallbacks), typed
rejections on the timeline/delivery logs, per-instance dedupe policy. This
pack contributes zero provider knowledge — that is the point; first-class
providers ship as their own packs with their own protocols.
