# Effect AI docs for Proxus

This documentation resides in the Effect monorepo, which contains the source
code for the Effect library and its related packages.

When you need to find any information about the Effect library, only use this
documentation and the source code found in `./packages`. Do not use
`node_modules` or any other external documentation, as it may be outdated or
incorrect.

**Note**: The examples in this documentation contain comments for illustration
purposes. In practice, you would not include these comments in your code.

This directory is a numbered, progressively loadable port of the official [`Effect-TS/effect/ai-docs`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs) snapshot.

## Authority and compatibility

- Upstream snapshot: `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (`effect@4.0.0-beta.101`).
- Installed Proxus version: `effect@4.0.0-beta.100`.
- Installed package types, project tests, `AGENTS.md`, and project architecture decisions override upstream examples.
- Files `01`–`80` preserve upstream ordering. Files `90`–`91` are Proxus extensions.
- APIs under `effect/unstable/*` must remain localized behind an application-owned seam.

## Reading map

01. [Effect core](./01_effect/README.md)
03. [Stream](./03_stream.md)
04. [Integration](./04_integration.md)
05. [Batching](./05_batching.md)
06. [Schedule](./06_schedule.md)
07. [DateTime](./07_datetime.md)
08. [Observability](./08_observability.md)
09. [Testing](./09_testing.md)
10. [Predicate](./10_predicate.md)
50. [HTTP client](./50_http_client.md)
51. [HTTP server](./51_http_server.md)
60. [Child process](./60_child_process.md)
70. [CLI](./70_cli.md)
71. [AI](./71_ai.md)
80. [Cluster](./80_cluster.md)
90. [React and Effect Atom (Proxus)](./90_react_and_effect_atom.md)
91. [Proxus conventions](./91_proxus_conventions.md)

## Provenance

See [SOURCE.md](./SOURCE.md) and the preserved [MIT license](./LICENSE.md).
