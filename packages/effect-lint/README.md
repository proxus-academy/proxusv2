# @proxus/effect-lint

Workspace checker for platform APIs that should be implemented with native Effect capabilities.

It complements rather than replaces the Effect Language Service. The LSP remains enabled and owns expression/program diagnostics such as `process.env`, global fetch/timers, Effect composition, Layers and error channels. This package owns dependency-selection rules that require an explicit Effect platform adapter.

Current rules:

- `no-native-sqlite`: use Effect SQL SQLite or the repository PGlite adapter.
- `no-dotenv`: use `Config` and `ConfigProvider`.

Run:

```bash
pnpm effect:lint
pnpm --filter @proxus/effect-lint test
```

New rules require a documented Effect replacement and tests proving they do not duplicate an Effect LSP expression diagnostic.
