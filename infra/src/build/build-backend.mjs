#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const output = resolve(repository, "dist/production-backend")
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

const entryPoints = {
  server: resolve(repository, "apps/server/src/prod.ts"),
  "admin-server": resolve(repository, "apps/admin-server/src/prod.ts"),
  migrate: resolve(repository, "packages/backend-infra/src/database/migrate.postgres.ts"),
}

for (const [name, entryPoint] of Object.entries(entryPoints)) {
  const outfile = resolve(output, `${name}.mjs`)
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: "esm",
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    platform: "node",
    target: "node22",
    sourcemap: false,
    legalComments: "none",
    external: ["pg-native"],
    logLevel: "info",
  })
  const artifact = readFileSync(outfile, "utf8")
  if (artifact.includes("Dynamic require of") && !artifact.includes("const require = __createRequire(import.meta.url)")) {
    throw new Error(`${name} production artifact has no ESM createRequire bridge for bundled CommonJS dependencies`)
  }
  for (const forbidden of ["pglite", "dev-server", "ERR_MODULE_NOT_FOUND"]) {
    if (artifact.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(`${name} production artifact contains forbidden runtime content ${forbidden}`)
    }
  }
}

cpSync(resolve(repository, "packages/backend-infra/drizzle"), resolve(output, "drizzle"), { recursive: true })
