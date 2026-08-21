#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const rootManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
const temporaryRoot = mkdtempSync(join(tmpdir(), "proxus-validation-"))
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const directoryLinkType = process.platform === "win32" ? "junction" : "dir"

const write = (base, path, content) => {
  const target = resolve(base, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}
const writeJson = (base, path, value) => write(base, path, `${JSON.stringify(value, null, 2)}\n`)
const linkNodeModules = (base) => symlinkSync(resolve(root, "node_modules"), resolve(base, "node_modules"), directoryLinkType)
const writeToolManifest = (base, scripts) => writeJson(base, "package.json", {
  private: true,
  type: "module",
  scripts
})

const run = (command, args, cwd) => spawnSync(command, args, {
  cwd,
  encoding: "utf8",
  shell: process.platform === "win32" && /[.](?:cmd|bat)$/i.test(command)
})
const runPnpmScript = (name, cwd) => run(pnpm, ["run", name], cwd)

const expectFailure = (label, result, expected) => {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  if (result.status === 0) throw new Error(`${label} accepted its deliberate defect`)
  for (const marker of expected) {
    if (!output.includes(marker)) {
      throw new Error(`${label} failed for an unexpected reason; missing ${marker}\n${output}`)
    }
  }
  console.log(`[ok] ${label} rejected its deliberate defect`)
  return output
}

const expectAbsent = (label, output, unexpected) => {
  for (const marker of unexpected) {
    if (output.includes(marker)) throw new Error(`${label} reported excluded/allowed probe ${marker}\n${output}`)
  }
}

try {
  const effectProbe = resolve(temporaryRoot, "effect")
  mkdirSync(resolve(effectProbe, "apps/web"), { recursive: true })
  linkNodeModules(effectProbe)
  cpSync(resolve(root, "tsconfig.base.json"), resolve(effectProbe, "tsconfig.base.json"))
  cpSync(resolve(root, "apps/web/tsconfig.json"), resolve(effectProbe, "apps/web/tsconfig.json"))
  writeToolManifest(resolve(effectProbe, "apps/web"), { typecheck: "tsc --noEmit" })
  writeJson(effectProbe, "effect-inventory.json", [{ path: "apps/web" }])
  write(
    effectProbe,
    "apps/web/vite.config.ts",
    'console.log("diagnostics config probe")\n\nconst invalidPort: number = "not a port"\nvoid invalidPort\n'
  )
  expectFailure(
    "Effect diagnostics wrapper and config inventory",
    run(
      process.execPath,
      [resolve(root, "scripts/run-effect-diagnostics.mjs"), "--root", effectProbe, "--inventory", "effect-inventory.json"],
      root
    ),
    ["globalConsole", "apps/web/tsconfig.json"]
  )
  expectFailure(
    "TypeScript config include",
    runPnpmScript("typecheck", resolve(effectProbe, "apps/web")),
    ["vite.config.ts", "TS2322"]
  )

  const oxlintProbe = resolve(temporaryRoot, "oxlint")
  mkdirSync(oxlintProbe, { recursive: true })
  linkNodeModules(oxlintProbe)
  writeToolManifest(oxlintProbe, { lint: rootManifest.scripts.lint })
  cpSync(resolve(root, ".oxlintrc.json"), resolve(oxlintProbe, ".oxlintrc.json"))
  writeJson(oxlintProbe, "apps/probe/tsconfig.json", {
    compilerOptions: { module: "ESNext", noEmit: true, strict: true, target: "ES2022" },
    include: ["*.config.ts"]
  })
  write(
    oxlintProbe,
    "apps/probe/vite.config.ts",
    "async function save(): Promise<void> {}\n\nsave()\nconst forced = ({ value: 'text' } as unknown) as { value: number }\nvoid forced\n"
  )
  expectFailure(
    "Oxlint package wrapper and config traversal",
    runPnpmScript("lint", oxlintProbe),
    ["typescript(no-floating-promises)", "typescript(no-unsafe-type-assertion)", "vite.config.ts"]
  )

  const uiProbe = resolve(temporaryRoot, "ui-architecture")
  mkdirSync(resolve(uiProbe, "apps/admin/src/components/ui"), { recursive: true })
  writeToolManifest(uiProbe, { "ui:architecture": rootManifest.scripts["ui:architecture"] })
  writeJson(uiProbe, "apps/admin/package.json", { name: "@fixture/admin", dependencies: {} })
  writeJson(uiProbe, "apps/web/package.json", { name: "@fixture/web", dependencies: {} })
  mkdirSync(resolve(uiProbe, "scripts"), { recursive: true })
  cpSync(resolve(root, "scripts/validate-ui-architecture.mjs"), resolve(uiProbe, "scripts/validate-ui-architecture.mjs"))
  expectFailure(
    "UI architecture ownership",
    runPnpmScript("ui:architecture", uiProbe),
    ["forbidden visual owner: apps/admin/src/components/ui"]
  )

  const boundariesProbe = resolve(temporaryRoot, "boundaries")
  mkdirSync(resolve(boundariesProbe, "apps"), { recursive: true })
  linkNodeModules(boundariesProbe)
  writeToolManifest(boundariesProbe, { boundaries: rootManifest.scripts.boundaries })
  cpSync(resolve(root, "dependency-cruiser.config.mjs"), resolve(boundariesProbe, "dependency-cruiser.config.mjs"))
  writeJson(boundariesProbe, "packages/backend-domain/package.json", {
    name: "@fixture/domain",
    type: "module",
    dependencies: { "forbidden-dependency": "1.0.0" }
  })
  writeJson(boundariesProbe, "packages/backend-infra/package.json", { name: "@fixture/infra", type: "module" })
  writeJson(boundariesProbe, "packages/backend-transport/package.json", { name: "@fixture/public-transport", type: "module" })
  writeJson(boundariesProbe, "packages/backend-admin-transport/package.json", { name: "@fixture/admin-transport", type: "module" })
  writeJson(boundariesProbe, "packages/shared/package.json", { name: "@fixture/shared", type: "module" })
  writeJson(boundariesProbe, "apps/web/package.json", {
    name: "@fixture/web",
    type: "module",
    dependencies: { clsx: "1.0.0" }
  })
  write(boundariesProbe, "packages/backend-infra/src/adapter.ts", "export const adapter = true\n")
  write(boundariesProbe, "apps/web/src/bad.ts", 'import "clsx"\n')
  write(boundariesProbe, "apps/web/node_modules/clsx/package.json", '{"name":"clsx","type":"module","exports":"./index.js"}\n')
  write(boundariesProbe, "apps/web/node_modules/clsx/index.js", "export default true\n")
  write(boundariesProbe, "packages/backend-domain/src/bad.ts", 'import "node:fs"\nimport "forbidden-dependency"\nimport { adapter } from "../../backend-infra/src/adapter.js"\nvoid adapter\n')
  write(boundariesProbe, "packages/backend-domain/src/bad.test.ts", 'import "node:fs"\n')
  write(boundariesProbe, "packages/backend-domain/node_modules/forbidden-dependency/package.json", '{"name":"forbidden-dependency","type":"module","exports":"./index.js"}\n')
  write(boundariesProbe, "packages/backend-domain/node_modules/forbidden-dependency/index.js", "export default true\n")
  write(boundariesProbe, "packages/shared/src/public-api.ts", 'import "node:path"\nimport "./admin-api.js"\n')
  write(boundariesProbe, "packages/shared/src/bad.test.ts", 'import "node:path"\n')
  write(boundariesProbe, "packages/shared/src/admin-api.ts", 'import "./public-api.js"\n')
  write(boundariesProbe, "packages/backend-transport/src/bad.ts", 'import "../../backend-admin-transport/src/http.js"\nimport "../../shared/src/admin-api.js"\n')
  write(boundariesProbe, "packages/backend-admin-transport/src/http.ts", 'import "../../backend-transport/src/public.js"\nimport "../../shared/src/public-api.js"\n')
  write(boundariesProbe, "packages/backend-transport/src/public.ts", "export const publicRoute = true\n")
  write(boundariesProbe, "packages/backend-domain/dist/generated.ts", 'import "../../backend-infra/src/adapter.js"\n')
  write(boundariesProbe, "packages/backend-domain/storybook-static/generated.ts", 'import "../../backend-infra/src/adapter.js"\n')
  const boundariesOutput = expectFailure(
    "dependency-cruiser package wrapper and architecture rules",
    runPnpmScript("boundaries", boundariesProbe),
    [
      "domain-does-not-depend-on-adapters",
      "domain-external-dependencies-allowlist",
      "domain-test-external-dependencies-allowlist",
      "shared-external-dependencies-allowlist",
      "shared-test-external-dependencies-allowlist",
      "public-transport-is-not-admin",
      "packages/backend-transport/src/bad.ts → packages/shared/src/admin-api.ts",
      "packages/backend-transport/src/bad.ts → packages/backend-admin-transport/src/http.ts",
      "admin-transport-is-not-public",
      "packages/backend-admin-transport/src/http.ts → packages/shared/src/public-api.ts",
      "packages/backend-admin-transport/src/http.ts → packages/backend-transport/src/public.ts",
      "public-shared-api-is-not-admin",
      "packages/shared/src/public-api.ts → packages/shared/src/admin-api.ts",
      "admin-shared-api-is-not-public",
      "react-apps-use-ui-styling",
      "packages/shared/src/admin-api.ts → packages/shared/src/public-api.ts"
    ]
  )
  expectAbsent("dependency-cruiser generated-directory exclusions", boundariesOutput, [
    "dist/generated.ts",
    "storybook-static/generated.ts"
  ])

  const knipProbe = resolve(temporaryRoot, "knip")
  mkdirSync(knipProbe, { recursive: true })
  linkNodeModules(knipProbe)
  writeToolManifest(knipProbe, { knip: rootManifest.scripts.knip })
  write(knipProbe, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n')
  writeJson(knipProbe, "packages/probe/package.json", {
    name: "@fixture/probe",
    type: "module",
    exports: { ".": "./src/index.ts" }
  })
  write(knipProbe, "packages/probe/src/index.ts", "export const used = true\n")
  write(knipProbe, "packages/probe/src/unused.ts", "export const unused = true\n")
  cpSync(resolve(root, "knip.json"), resolve(knipProbe, "knip.json"))
  expectFailure(
    "Knip package wrapper and workspace glob",
    runPnpmScript("knip", knipProbe),
    ["unused.ts"]
  )

  const contractsProbe = resolve(temporaryRoot, "workspace-contracts")
  writeJson(contractsProbe, "apps/consumer/package.json", {
    name: "@fixture/consumer",
    type: "module",
    dependencies: { "@fixture/library": "workspace:*", duplicated: "1.0.0" },
    devDependencies: { duplicated: "1.0.0" }
  })
  writeJson(contractsProbe, "apps/consumer/tsconfig.json", {
    compilerOptions: {
      baseUrl: ".",
      module: "ESNext",
      moduleResolution: "Bundler",
      paths: { "@library/*": ["../../packages/library/src/*"] },
      target: "ES2022"
    },
    include: ["src/**/*.ts"]
  })
  write(
    contractsProbe,
    "apps/consumer/src/index.ts",
    'import "@fixture/library/private"\nimport "@fixture/library/wild/missing"\nimport "@library/private"\nimport "../../../packages/library/src/private.js"\nimport "undeclared"\nimport "node:test/reporters"\n'
  )
  writeJson(contractsProbe, "packages/library/package.json", {
    name: "@fixture/library",
    type: "module",
    exports: {
      ".": "./src/index.ts",
      "./missing": "./src/missing.ts",
      "./wild/*": "./src/wild/*.ts",
      "./empty/*": "./src/empty/*.ts"
    }
  })
  write(contractsProbe, "packages/library/src/index.ts", "export const value = true\n")
  write(contractsProbe, "packages/library/src/private.ts", "export const privateValue = true\n")
  write(contractsProbe, "packages/library/src/wild/present.ts", "export const present = true\n")
  const contractsOutput = expectFailure(
    "workspace contract checker wrapper",
    run(
      process.execPath,
      [resolve(root, "scripts/check-workspace-contracts.mjs"), "--root", contractsProbe],
      root
    ),
    [
      "[duplicate-dependency]",
      "./missing target ./src/missing.ts does not exist",
      "./empty/* target ./src/empty/*.ts matches no files",
      "@fixture/library/private is not backed by an existing export target",
      "@fixture/library/wild/missing is not backed by an existing export target",
      "@library/private resolves to packages/library/src/private.ts",
      "../../../packages/library/src/private.js resolves to packages/library/src/private.ts",
      "[undeclared-dependency]"
    ]
  )
  expectAbsent("workspace contract Node builtin probe", contractsOutput, ["node:test/reporters"])

  console.log("Validation self-test passed; all deliberate defects were detected by the real wrappers and globs.")
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
