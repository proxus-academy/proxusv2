# CI validation performance plan

## Outcome

Phase 1 was promoted after the parallel jobs reproduced the monolithic gate and the TypeScript 7-backed Oxlint spike preserved the configured lint findings. CI now runs the strict gates independently without the duplicate sequential job. Measured validation feedback is normally dominated by complete Effect diagnostics at roughly 1.5–2.5 minutes; runner and cache variance remains visible in each named check. Effect diagnostics retain the complete project inventory and zero-warning policy.

## Objective

Reduce pull-request feedback time without removing any existing static, Vitest/PGlite, build, or PostgreSQL gate. The first target is a cold critical path of 2–3 minutes and a cached path below 2 minutes for small changes.

## Baseline

GitHub Actions run `32383329052` took 6 minutes 53 seconds. The independent PostgreSQL job completed in about 55 seconds; the critical path was the monolithic `validate` job.

A later run (`32384470240`) confirmed the same shape and exposed an important scheduling constraint: setup plus the complete static sequence took about 4 minutes 20 seconds. A single `static` job therefore cannot meet the cold 2–3 minute target even when tests and builds run beside it.

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
- Keep the current type-aware lint rules, dependency-cruiser, Knip, and workspace contracts without accepted-violation baselines during the scheduling experiment.
- Keep complete Effect diagnostics in strict mode and treat every lint or diagnostic warning as a CI failure.
- Keep normal PGlite suites and the independent PostgreSQL 17 migration/adapter gate.
- Do not describe Storybook builds or DOM tests as browser journeys.
- Optimize execution and scheduling before reducing validation coverage.

## Phase 1 — parallel gates and persistent caches

### 1. Split the monolithic validation job

Evaluate independently visible jobs for each material part of the critical path:

```text
self-test ───────────┐
effect-diagnostics ──┤
typecheck ───────────┤
lint ────────────────┤
architecture ────────┤── candidate required PR gates
knip ────────────────┤
workspace-contracts ─┤
tests ───────────────┤
build ───────────────┤
postgres ────────────┘
```

Suggested responsibilities:

- `self-test`: the validator self-test;
- `effect-diagnostics`: the complete Effect TypeScript project inventory;
- `typecheck`: every workspace typecheck through Turborepo;
- `lint`: the current type-aware lint rules;
- `architecture`: dependency-cruiser while its guarantees and possible replacement are evaluated;
- `knip`: unreachable files, exports and dependency usage;
- `workspace-contracts`: package manifests, exports and direct dependency declarations;
- `tests`: implemented normal Vitest suites, including PGlite and excluding PostgreSQL-only tests;
- `build`: all real workspace builds, including Storybook;
- `postgres`: the existing PostgreSQL 17 migration and adapter suite.

These jobs should start concurrently. Keep `cancel-in-progress: true` so a newer commit supersedes obsolete work. Keeping all static checks in one job would reduce total runner setup but leave a cold critical path above four minutes.

### 2. Persist pnpm and Turborepo caches

Configure pnpm store caching through `actions/setup-node` or an equivalently pinned action, using `pnpm-lock.yaml` as the dependency key.

Persist `.turbo` between workflow runs. Start with GitHub Actions cache and restore keys that permit reuse from the base branch. Evaluate Turbo Remote Cache later if sharing results with local development or multiple workflows provides enough value.

Use a separate Turborepo cache namespace for each concurrent task category. For example, `typecheck`, `tests`, and `build` must not race to save different partial `.turbo` directories under one cache key. The pnpm store may use a shared content-addressed cache.

Cache correctness requirements:

- environment variables that affect outputs remain declared in `turbo.json`;
- generated frontend and Storybook outputs remain declared;
- lockfile, package manifests, task configuration, source inputs, and global TypeScript configuration invalidate relevant entries;
- cache restoration must never turn a failed task into a successful gate.

### Experimental rollout

This rollout is complete. During measurement, the original `validate` and `postgres` jobs remained authoritative while parallel jobs ran on pull requests. Experimental jobs are advisory because they are not configured as required checks in repository policy; they intentionally do not use `continue-on-error`, so a detected defect remains visibly red and can be compared with the authoritative result.

Compare the original and experimental paths on the same commits:

1. run the first commit with cold Turborepo namespaces;
2. push a documentation-only follow-up and verify category-specific cache hits;
3. inject temporary failures for Effect diagnostics, TypeScript, lint, dependency-cruiser, Knip, workspace contracts, Vitest/PGlite, builds, and PostgreSQL;
4. verify that every defect rejected by the original path is rejected by the corresponding experimental job;
5. only then replace the original job and configure the resulting checks as repository merge requirements.

The experimental workflow must not change build semantics, test concurrency, affected-package selection, or validation coverage. Those remain separate phases so timing and correctness regressions have one plausible cause.

The validator self-test runs on every pull request during parity measurement. After promotion, restrict it to changes in validation scripts, validator configuration, workspace manifests, TypeScript configuration and CI workflows, while retaining an explicit or scheduled full run.

### Follow-up toolchain spike — TypeScript 7 and Oxlint

Run this as an isolated change after the scheduling experiment. Evaluate `@typescript/native-preview`, `oxlint-tsgolint` and Oxlint type-aware rules against the current ESLint diagnostics. The spike succeeds only if it:

- reproduces every current lint failure without introducing accepted warnings;
- runs with `--report-unused-disable-directives` and treats warnings as errors;
- preserves the complete strict Effect diagnostics inventory and all configured diagnostics;
- passes `pnpm validate:pr` and the PostgreSQL gate;
- establishes whether TypeScript 7 can be normative for typechecking or only the Oxlint backend;
- demonstrates enough parity to remove ESLint and `typescript-eslint` rather than keeping two permanent linters.

Do not weaken or disable an Effect diagnostic to make the migration pass. Record cold and warm timings against the existing ESLint and TypeScript commands.

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
- Self-test, Effect diagnostics, typecheck, lint, architecture, Knip, workspace contracts, tests, build, and PostgreSQL appear as separate GitHub checks.
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

1. Add advisory parallel jobs while retaining the original authoritative validation.
2. Add pnpm store caching and category-specific `.turbo` persistence to those jobs.
3. Compare cold, warm, and deliberately failing runs against the original job.
4. Promote the parallel checks only after parity is demonstrated.
5. Run the isolated TypeScript 7 and Oxlint parity spike.
6. Remove duplicate non-emitting build scripts in a separate change.
7. Parallelize non-PGlite tests while retaining package-local limits.
8. Evaluate affected package tasks, with complete validation retained on `main`.

Phase 1 has the highest expected impact with the lowest correctness risk because it changes scheduling and reuse without reducing coverage. The temporary duplicate execution costs more runner time, but it supplies a direct equivalence check before the authoritative gate changes.
