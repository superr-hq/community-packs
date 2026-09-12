# manual

Hand-fired runs. One node: `invoke` — a trigger that never claims an HTTP
route (no `routeClaim` in its trigger declaration; routes are declared or
absent, never defaulted). A run starts through a seeded RunRequest carrying
an explicit payload, which lands on the `payload` port verbatim. `null` is a
legitimate payload; an absent payload key is a typed `PAYLOAD_REQUIRED`
failure — manual fires never invent defaults.
