# CI validation performance plan

## Objective

Reduce pull-request feedback time without removing any existing static, Vitest/PGlite, build, or PostgreSQL gate. The first target is a cold critical path of 2–3 minutes and a cached path below 2 minutes for small changes.

## Baseline

GitHub Actions run `32383329052` took 6 minutes 53 seconds. The independent PostgreSQL job completed in about 55 seconds; the critical path was the monolithic `validate` job.

Approximate timings:

| Phase | Duration |
| --- | ---: |
| Setup and frozen install | 26 s |
| Validator self-test | 9 s |
| Effect diagnostics | 1 min 39 s |
| Typecheck | 1 min 4 s |
| Type-aware ESLint | 42 s |
| Boundaries, Knip, and workspace contracts | 6 s |
| Vitest/PGlite | 1 min 44 s |
| Workspace build | 1 min |
| Total | 6 min 53 s |

The current root command serializes every phase:

```text
self-test → diagnostics → typecheck → lint → architecture checks → tests → build
```

All Turborepo tasks in the measured run were cache misses because no remote or GitHub Actions cache persists `.turbo` between ephemeral runners.

## Constraints

- Preserve the gates documented in `docs/testing.md`.
- Keep Effect diagnostics across the complete TypeScript project inventory.
- Keep type-aware ESLint, dependency-cruiser, Knip, and workspace contracts without accepted-violation baselines.
- Keep normal PGlite suites and the independent PostgreSQL 17 migration/adapter gate.
- Do not describe Storybook builds or DOM tests as browser journeys.
- Optimize execution and scheduling before reducing validation coverage.

## Phase 1 — parallel gates and persistent caches

### 1. Split the monolithic validation job

Replace the single `validate` job with independently visible jobs:

```text
static ───────┐
tests ────────┼── required PR gates
build ────────┤
postgres ─────┘
```

Suggested responsibilities:

- `static`: validator self-test, Effect diagnostics, typecheck, ESLint, dependency-cruiser, Knip, and workspace contracts;
- `tests`: implemented normal Vitest suites, including PGlite and excluding PostgreSQL-only tests;
- `build`: all real workspace builds, including Storybook;
- `postgres`: the existing PostgreSQL 17 migration and adapter suite.

These jobs should start concurrently. Keep `cancel-in-progress: true` so a newer commit supersedes obsolete work.

### 2. Persist pnpm and Turborepo caches

Configure pnpm store caching through `actions/setup-node` or an equivalently pinned action, using `pnpm-lock.yaml` as the dependency key.

Persist `.turbo` between workflow runs. Start with GitHub Actions cache and restore keys that permit reuse from the base branch. Evaluate Turbo Remote Cache later if sharing results with local development or multiple workflows provides enough value.

Cache correctness requirements:

- environment variables that affect outputs remain declared in `turbo.json`;
- generated frontend and Storybook outputs remain declared;
- lockfile, package manifests, task configuration, source inputs, and global TypeScript configuration invalidate relevant entries;
- cache restoration must never turn a failed task into a successful gate.

### 3. Remove duplicate typecheck builds

Several non-emitting packages currently expose both:

```json
"typecheck": "tsc --noEmit",
"build": "tsc --noEmit"
```

Reserve `typecheck` for TypeScript validation and `build` for modules that produce a deployable or consumable artifact. Remove pass-through `build` scripts that only repeat `tsc --noEmit`, then update the Turborepo graph and workspace contracts if required.

The resulting build gate must still build Web, Admin, Storybook, and every other real artifact. Static validation remains responsible for typechecking all TypeScript projects.

### Phase 1 acceptance criteria

- The same defects rejected by the current PR validation remain rejected.
- Static, tests, build, and PostgreSQL appear as separate GitHub checks.
- A cold run has a critical path no longer than 3 minutes under normal runner conditions.
- A second small PR update demonstrates Turborepo cache hits.
- `docs/testing.md` reflects the resulting job structure and cache behavior.

## Phase 2 — test scheduling

### 4. Isolate PGlite resource constraints

The measured tests took 1 minute 44 seconds, with `@proxus/backend-infra` accounting for about 54 seconds. The root currently runs Turborepo with `--concurrency=1`, serializing every package because PGlite requires constrained execution.

Keep resource limits inside PGlite-owning test modules using Vitest options such as `--no-file-parallelism --maxWorkers=1`, but allow independent packages to run concurrently. Possible implementations:

- increase Turborepo test concurrency while retaining package-local Vitest limits; or
- split PGlite suites into a dedicated job and run unit/frontend suites in parallel.

Validate the change repeatedly before adoption. Any PGlite flake, excess memory use, port collision, or shared-state leak blocks this step.

### Phase 2 acceptance criteria

- At least ten consecutive CI runs pass without test flakes.
- PGlite remains deterministic and resource-safe.
- Test critical-path time is materially lower than the 1 minute 44 second baseline.
- No suite is omitted or silently skipped.

## Phase 3 — affected validation

### 5. Use the workspace dependency graph for PR-scoped tasks

Evaluate Turborepo affected filters based on `origin/main` for package-local `typecheck`, `test`, and `build` tasks. Filters must include changed modules, their dependencies, and affected dependents.

Global validators should remain complete initially:

- validator self-test;
- Effect diagnostics, unless its full-inventory invariant is safely preserved another way;
- type-aware root ESLint;
- dependency-cruiser;
- Knip;
- workspace contracts.

Keep a complete validation on `main` and optionally nightly. A PR-scoped gate may only become required after proving that representative cross-package defects are still detected.

### Phase 3 acceptance criteria

- Documentation-only and isolated package changes avoid unrelated package builds/tests.
- Cross-package contract and dependent breakages remain detected.
- `main` retains a complete validation run.
- Small cached changes complete required feedback in less than 2 minutes under normal runner conditions.

## Observability

Expose each major phase as a separate step or job so GitHub records useful durations. Track at least:

- dependency installation;
- Effect diagnostics;
- typecheck;
- ESLint;
- architecture validators;
- normal tests;
- PGlite tests;
- builds;
- PostgreSQL tests;
- cache hit/miss counts.

Capture a baseline before each phase and compare several runs rather than relying on a single runner. Performance regressions should be visible without downloading and manually parsing the complete workflow log.

## Recommended implementation order

1. Split static, tests, build, and PostgreSQL into parallel jobs.
2. Add pnpm store and `.turbo` persistence.
3. Remove duplicate non-emitting build scripts.
4. Measure cold and warm runs and update `docs/testing.md`.
5. Parallelize non-PGlite tests while retaining package-local limits.
6. Evaluate affected package tasks, with complete validation retained on `main`.

Phase 1 has the highest expected impact with the lowest correctness risk because it changes scheduling and reuse without reducing coverage.
