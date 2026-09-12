# flow-core

Core workflow control nodes. Four nodes:

| Node | Kind | Purpose |
|---|---|---|
| `set-state` | step | Writes `{key, value}` into workflow state via the host's `state.write` service port; echoes the record on its output ports so downstream nodes can reference it without re-reading state. |
| `delay` | delay | Computes the resume instant (`mode:"duration"` or `mode:"until"`). Sleeping is the compiler's DELAY pattern — this pack never blocks; time enters through the host-injected `__superrNow()` port. |
| `condition` | gate | Evaluates one comparison and emits the `branch` port (`"true"` / `"false"`) that drives kernel edge guards; junk operands deactivate rather than throw. |
| `webhook-wait` | hook | Pauses workflow execution until an external HTTP callback arrives at the hook route, then resumes with the parsed request payload (`body`, `headers`, `query`, `method`). |

Layout follows the §4.2 pack contract: `pack.json` manifest, pure
`runtime/*.shape.ts` modules (bundled as hermetic embeds), local-execution
`runtime/*.op.ts`, wiring-only `deploy/*.step.ts`, and a fixture corpus per
node under `fixtures/` that covers every declared error code.
