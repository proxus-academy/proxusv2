# Effect AI docs provenance

## Version pins

| Source | Version / commit | Role |
| --- | --- | --- |
| Proxus installation | `effect@4.0.0-beta.98` | Compile-time authority |
| Effect AI docs | `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` | Documentation snapshot |
| Snapshot package | `effect@4.0.0-beta.101` | Upstream example version |

Source repository: [`Effect-TS/effect`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs).

The upstream source is MIT licensed. [`LICENSE.md`](./LICENSE.md) preserves its license. Every ported chapter links to its exact source directory.

## Coverage

| Upstream source | Proxus destination |
| --- | --- |
| `01_effect/01_basics` | [`01_effect/01_basics.md`](./01_effect/01_basics.md) |
| `01_effect/02_schema` | [`01_effect/02_schema.md`](./01_effect/02_schema.md) |
| `01_effect/03_services` | [`01_effect/03_services.md`](./01_effect/03_services.md) |
| `01_effect/04_errors` | [`01_effect/04_errors.md`](./01_effect/04_errors.md) |
| `01_effect/05_resources` | [`01_effect/05_resources.md`](./01_effect/05_resources.md) |
| `01_effect/06_running` | [`01_effect/06_running.md`](./01_effect/06_running.md) |
| `01_effect/07_pubsub` | [`01_effect/07_pubsub.md`](./01_effect/07_pubsub.md) |
| `03_stream` | [`03_stream.md`](./03_stream.md) |
| `04_integration` | [`04_integration.md`](./04_integration.md) |
| `05_batching` | [`05_batching.md`](./05_batching.md) |
| `06_schedule` | [`06_schedule.md`](./06_schedule.md) |
| `07_datetime` | [`07_datetime.md`](./07_datetime.md) |
| `08_observability` | [`08_observability.md`](./08_observability.md) |
| `09_testing` | [`09_testing.md`](./09_testing.md) |
| `10_predicate` | [`10_predicate.md`](./10_predicate.md) |
| `50_http-client` | [`50_http_client.md`](./50_http_client.md) |
| `51_http-server` and fixtures | [`51_http_server.md`](./51_http_server.md) |
| `60_child-process` | [`60_child_process.md`](./60_child_process.md) |
| `70_cli` | [`70_cli.md`](./70_cli.md) |
| `71_ai` and fixtures | [`71_ai.md`](./71_ai.md) |
| `80_cluster` | [`80_cluster.md`](./80_cluster.md) |

Files `90` and `91` are project-owned extensions and are not attributed to upstream AI docs.

## Upgrade procedure

1. Pin the new upstream commit and record its Effect package version.
2. Diff `ai-docs/src` against the previous snapshot.
3. Preserve upstream numeric ordering, including newly added or removed sections.
4. Regenerate chapters from each `index.md`, numbered example, and supporting fixture.
5. Verify changed imports and signatures against the installed Proxus version.
6. Review changes to `effect/unstable/*` especially carefully.
7. Validate local Markdown links and run proportional TypeScript diagnostics for adopted examples.
8. Update version warnings and this coverage table in the same change.
