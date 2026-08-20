# TypeScript 7 and Oxlint spike

## Decision

Oxlint with `oxlint-tsgolint` can replace ESLint for the repository's current lint rules. It does not replace the normative package typecheck or Effect diagnostics.

The resulting validation responsibilities are:

```text
Oxlint + TypeScript 7  → type-aware lint rules
TypeScript 5.9         → package typecheck, generated-source workflows and Astro checks
Effect Language Service → complete strict Effect diagnostics
```

No warning baseline is accepted. Oxlint runs with `--deny-warnings` and `--report-unused-disable-directives`; Effect diagnostics retain `--strict` and all configured diagnostics remain errors.

## Compatibility findings

- `oxlint@1.79.0` with `oxlint-tsgolint@7.0.2001` lint all application and package sources successfully. The tsgolint binary provides the TypeScript 7 frontend; a direct `@typescript/native-preview` dependency is unnecessary.
- TypeScript 7 rejects the removed `baseUrl` option. The Admin alias already has an explicit `paths` target, so removing `baseUrl` preserves resolution.
- TypeScript 7 checks side-effect imports and required an ambient CSS module declaration for Storybook.
- The complete 16-project Effect diagnostics inventory passes unchanged with zero errors, warnings or messages.
- Stable `pnpm typecheck` remains necessary because package scripts generate Paraglide sources, run Astro's checker and retain the compiler patched by Effect Language Service.
- `oxlint --type-check` passes after package generators have run, but it is not the standalone normative typecheck because it does not orchestrate those package-specific prerequisites.

## Rule parity

Oxlint enables direct equivalents for every previous ESLint rule:

- `typescript/await-thenable`;
- `typescript/no-floating-promises`;
- `typescript/no-misused-promises`;
- `typescript/no-non-null-assertion`;
- `typescript/no-unsafe-type-assertion`;
- `no-restricted-imports` with the existing Node.js API list and message.

The validator self-test injects a floating promise and unsafe assertion into a TypeScript config file and requires Oxlint to reject both, protecting command traversal and type-aware configuration.

## Timing

Measured locally on the same clean worktree:

| Command | Wall time |
| --- | ---: |
| ESLint type-aware | 79.4 s |
| Oxlint type-aware | 13.7 s |
| Oxlint type-aware plus TypeScript 7 diagnostics | 18.3 s |

These are single-machine spike measurements, not CI guarantees. CI should record cold and warm timings after the branch is pushed.
