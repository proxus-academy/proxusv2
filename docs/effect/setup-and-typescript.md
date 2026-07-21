# Effect Setup and TypeScript

> **Document status:** Draft. The repository already satisfies the runtime and strict-TypeScript requirements below, but the Effect Language Service recommendations are not yet adopted by this template.

This page defines the setup policy for Effect v4 code in this workspace. It targets the versions currently pinned by the repository: `effect` and first-party Effect packages at `4.0.0-beta.98`, TypeScript `5.9.x`, Node.js 24+, and pnpm 10.

## Policy Levels

- **Required**: new code and configuration must comply. A deviation needs an explicit repository decision.
- **Recommended**: the default for new projects or future template work, but adoption may require a dedicated change.
- **Available**: a supported option for a specific need; do not add it speculatively.

These labels are template policy. They are not claims about guarantees made by Effect upstream.

## When and Why

Use this page when bootstrapping a clone, adding an Effect workspace, changing TypeScript compilation, or diagnosing editor/build disagreement.

Strict TypeScript and one pinned Effect version are **Required** because Effect communicates success, expected failures, and requirements through types. Weak or inconsistent compiler settings can hide defects at the same seams where Effect is intended to provide leverage. Workspace-local tooling also keeps editor diagnostics consistent across contributors and automation.

## Runtime and Dependency Baseline

### Required

- Use Node.js 24+ and the repository-pinned pnpm version.
- Install dependencies from the repository root with `pnpm install`.
- Keep all first-party Effect packages on the same exact prerelease version. In this repository that version is `4.0.0-beta.98`.
- Import stable core modules from `effect`; import v4 modules from their actual v4 paths, including `effect/unstable/*` where the installed API requires it.
- Commit the lockfile. Do not combine an Effect upgrade with unrelated behavior changes.
- Run checks in every affected workspace after an Effect or TypeScript upgrade.

```bash
pnpm install
pnpm check
pnpm build
pnpm lint
```

An Effect beta upgrade is a migration, not routine version drift. Review renamed exports, changed type parameter order, unstable module paths, schemas, layers, typed clients, and tests before updating all Effect packages atomically.

### Anti-patterns

- Mixing `effect@4.0.0-beta.98` with another beta of `@effect/*`.
- Copying Effect v2/v3 examples without checking the installed v4 declarations or the local v4 reference repository.
- Adding npm, Bun, or Yarn commands to project documentation when pnpm is the workspace package manager.
- Using floating `latest`, `beta`, or caret ranges for first-party Effect beta packages.

## Canonical TypeScript Configuration

The root `tsconfig.json` intentionally contains no files. Workspace projects extend `tsconfig.base.json` and set their own `rootDir`, `include`, and runtime-specific options.

### Required shared baseline

The current template baseline is bundler-oriented and type-check-only:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

Keep these properties unless a deliberate runtime/build migration changes them:

- `strict: true`: preserves Effect's typed success/error/requirement guarantees.
- `verbatimModuleSyntax: true`: makes type-only imports explicit and predictable.
- `moduleDetection: "force"`: treats every source file as a module.
- `isolatedModules: true`: keeps files compatible with per-file transforms.
- `noEmit: true`: TypeScript checks; Vite, `tsx`, or another tool executes/builds.
- `skipLibCheck: true`: avoids spending project check time rechecking dependency declarations.
- `target: "ES2022"`: provides the modern JavaScript baseline used by this template.

Each workspace must be `composite: true`. Frontend-only settings such as `jsx`, Vite globals, Testing Library globals, and aliases belong in the webapp configuration rather than shared/backend source.

### Recommended safety additions

For a newly bootstrapped repository, consider:

```json
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "sourceMap": true,
    "declarationMap": true
  }
}
```

These are **Recommended**, not descriptions of the current template baseline. Enable them in a focused change, fix all resulting diagnostics, and avoid weakening checks with broad exclusions.

### Choosing module settings

This repository currently uses `ESNext` plus `Bundler` because TypeScript does not emit and runtime/build tools resolve modules. Preserve that repository decision.

For a different Effect project:

- **Recommended**: use `module: "preserve"`, `moduleResolution: "bundler"`, and `noEmit: true` when a bundler transforms code.
- **Recommended**: use `module: "NodeNext"` when TypeScript emits Node.js applications or libraries. Follow Node ESM extension and package export rules.

The preceding distinction comes from Effect Solutions. Applying it to a particular runtime remains a project decision.

### Anti-patterns

- Disabling `strict` to make an Effect error or requirement disappear.
- Adding `any`, unchecked assertions, or blanket `@ts-ignore` comments instead of correcting a model or dependency graph.
- Giving every workspace browser globals.
- Setting incompatible module resolution independently in leaf workspaces.
- Assuming `skipLibCheck` disables checking project source; it only skips declaration-file checking.
- Switching this repository to `NodeNext` merely because the server runs on Node while `tsx` still owns execution and TypeScript still uses `noEmit`.

## Effect Language Service

### Recommended, currently draft for this template

Effect Solutions recommends `@effect/language-service` for Effect-specific editor and build diagnostics. This repository does not currently install or configure it, so the following is an adoption recipe, not current behavior.

1. Install it at the monorepo root with pnpm and pin a compatible version.
2. Add its schema and plugin to the shared TypeScript configuration.
3. Make editors use the workspace TypeScript installation.
4. If build-time Effect diagnostics are desired, patch TypeScript in a reproducible install lifecycle and verify CI.

```json
{
  "$schema": "https://raw.githubusercontent.com/Effect-TS/language-service/refs/heads/main/schema.json",
  "compilerOptions": {
    "plugins": [{ "name": "@effect/language-service" }]
  }
}
```

Before adoption, verify compatibility with TypeScript 5.9 and Effect `4.0.0-beta.98`. Do not copy the upstream Bun commands into this pnpm workspace unchanged. A future implementation should use the package's pnpm-compatible executable invocation and should document any `prepare` script it adds.

### Editor requirement after adoption

Editors must use `./node_modules/typescript/lib`, not a bundled TypeScript version. Otherwise the plugin may appear configured while producing no diagnostics.

- **VS Code/Cursor:** set `typescript.tsdk` to `./node_modules/typescript/lib`, enable the workspace-TypeScript prompt, and select “Use workspace version”.
- **JetBrains:** select the workspace TypeScript installation under Languages & Frameworks → TypeScript.
- **NVim/vtsls:** enable `@effect/language-service` as a TypeScript plugin in the vtsls configuration and point it at the workspace package; do not assume reading `tsconfig` alone loads editor plugins.
- **Emacs:** configure the TypeScript language server to load the workspace plugin and workspace TypeScript. Verify diagnostics in an Effect file before considering setup complete.

Editor instructions can drift independently of Effect. Keep editor-specific configuration local to the repository and verify it after TypeScript or Language Service upgrades.

### Build-time diagnostics

Effect Solutions proposes patching TypeScript with `effect-language-service patch` and persisting it in an install lifecycle script. This template has **not adopted** that behavior. If adopted, use a pinned package, a pnpm-compatible command, review the security/reproducibility impact of the install script, and add a CI assertion proving diagnostics run. Editor-only diagnostics are insufficient for enforcement.

### Effect Solutions CLI

The optional `effect-solutions` CLI can list or display the website topics (`list`, `show`) and open a feedback issue. It is a documentation browser, not a build/runtime dependency or project authority. Do not install a floating global `@latest` tool in CI. Prefer the pinned local handbook and source snapshot for reproducible agent work; if the CLI is used interactively, record the retrieval date before turning guidance into a project rule.

## Local Reference Material

### Recommended

Use `.repos/effect-smol` as a read-only v4 reference. It is pinned in this checkout at commit `3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec` and contains executable examples under `ai-docs/src`.

Reference code is evidence for the pinned snapshot, not a substitute for this template's architecture. In particular:

- repository policy still requires `HTTP handler -> Service/use-case Module -> Repository Interface -> Adapter`;
- shared contracts remain runtime-neutral;
- current project code and checks determine integration details;
- unstable APIs must be rechecked at every upgrade.

Do not edit the reference repository to make project checks pass.

## Testing Implications

- Run `pnpm check` to detect cross-workspace type incompatibilities.
- Run workspace builds because Vite/`tsx` resolution can differ from a bare TypeScript check.
- After changing compiler options, run server and webapp tests; stricter optional-property behavior can change fixtures and schema constructor calls.
- After changing Effect versions, exercise typed HTTP client tests and layer-based tests, not only compilation.
- If the Effect Language Service is adopted, add a CI check proving build-time diagnostics run; editor-only success is insufficient.

## Observability Implications

- Keep source maps enabled in build tooling used for production diagnostics, even if TypeScript itself does not emit.
- Named `Effect.fn` spans and fiber traces are only useful when deployed source and source maps correspond to the checked commit.
- Version skew can change tracing/logging module behavior. Validate OTLP startup and one representative trace after Effect upgrades.
- Never expose secrets in compiler diagnostics, build logs, or copied environment files.

## Checklist

### Required

- [ ] Node.js and pnpm satisfy the repository requirements.
- [ ] All first-party Effect packages use exactly `4.0.0-beta.98` or one deliberately upgraded version.
- [ ] Workspace TypeScript configs extend `tsconfig.base.json`.
- [ ] `strict`, `verbatimModuleSyntax`, `isolatedModules`, and `noEmit` remain enabled.
- [ ] Runtime-specific globals and aliases stay local to their workspace.
- [ ] `pnpm check`, affected tests, `pnpm build`, and `pnpm lint` pass.

### Recommended

- [ ] The Effect Language Service has been evaluated in a dedicated change.
- [ ] Editors use workspace TypeScript after plugin adoption.
- [ ] Additional strictness flags have been evaluated without broad suppressions.
- [ ] An Effect upgrade includes migration notes and a representative observability smoke check.

## Source Map

### Local sources

- `.repos/effect-smol/ai-docs/src/index.md`
- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/index.md`
- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/01_effect-gen.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`
- `package.json`
- `tsconfig.json`
- `tsconfig.base.json`
- `apps/server/tsconfig.json`
- `apps/webapp/tsconfig.json`
- `packages/shared/tsconfig.json`

### External sources

- Effect Solutions, Quick Start: https://www.effect.solutions/quick-start
- Effect Solutions, Project Setup: https://www.effect.solutions/project-setup
- Effect Solutions, TypeScript Configuration: https://www.effect.solutions/tsconfig
- Effect v4 reference repository: https://github.com/Effect-TS/effect-smol/tree/3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec
- Effect Language Service schema: https://raw.githubusercontent.com/Effect-TS/language-service/refs/heads/main/schema.json

Effect Solutions is a prescriptive community guide. Its recommendations are identified as such above; repository-specific requirements are template policy.
