# packs/\_template — the pack scaffold

Copy this directory to start a new first-party pack (`cp -r packs/_template
packs/<id>`, then rename inside). It exercises every part of the §4.2
directory contract:

| File | Role |
|---|---|
| `pack.json` | manifest — single source of truth (D01 §1); registry-validated |
| `runtime/<nodeKey>.shape.ts` | PURE logic; bundled into hermetic IIFE embeds — keep it dependency-free or `superr pack build` fails |
| `runtime/<nodeKey>.op.ts` | local execution contract (`execute(ctx)`, D01 §4) |
| `deploy/<nodeKey>.step.ts` | wiring-only `"use step"` body; calls `__superrShared_*` embeds |
| `fixtures/<nodeKey>/*.json` | corpus: `{name, input|delivery, config, expect}`; every declared error code needs a fixture |
| `dist/bundle.json` | committed output of `superr pack build` (§4.3) |

Rebuild after editing sources:

```sh
pnpm superr pack build template
```

The build is deterministic — two builds of the same tree are byte-equal, so
`dist/bundle.json` diffs are reviewable and CI can detect drift by rebuilding.
