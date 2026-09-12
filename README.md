# Superr Community Packs

The shared pack registry for [Superr](https://github.com/superr-hq/superr-cli).
Each directory under `packs/` is one installable pack (MIT-licensed per pack).

## Use a pack

```bash
superr pack fetch <packId>              # fetch from this registry (default)
superr pack fetch <packId> --registry <url>  # fetch from a fork instead
```

## Propose a pack

```bash
superr pack publish <packId>            # prints the fork + pull-request steps
```

Merging the PR is the approval gate — no custom review UI. Run
`superr pack validate` and `superr pack build` on your pack first so its
committed `dist/bundle.json` is byte-current (the conformance freshness gate
rejects stale bundles).

To run a private registry, fork this repo and point the CLI at it with
`--registry <your-fork-url>`.

## Layout

```
packs/<packId>/
├── pack.json        # manifest (id, version, nodes, errors, UI)
├── runtime/         # pure shape modules (*.shape.ts) + local ops (*.op.ts)
├── deploy/          # wiring-only deploy steps (*.step.ts)
├── fixtures/        # conformance fixture corpus
└── dist/            # committed build output (bundle.json + manifest.json)
```

## License

MIT per pack (see `LICENSE`).
