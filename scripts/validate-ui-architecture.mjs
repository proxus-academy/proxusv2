#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const forbiddenPaths = [
  "apps/admin/src/components/ui",
  "apps/web/src/components/ui",
  "apps/admin/src/ui",
  "apps/web/src/ui",
  "apps/admin/src/styles",
  "apps/web/src/styles",
  "apps/admin/components.json",
]
const forbiddenDependencies = new Set([
  "radix-ui",
  "class-variance-authority",
  "tailwind-merge",
  "clsx",
  "framer-motion",
  "shadcn",
  "tw-animate-css",
])

const defects = forbiddenPaths.filter((path) => existsSync(resolve(root, path))).map((path) => `forbidden visual owner: ${path}`)
for (const app of ["admin", "web"]) {
  const manifest = JSON.parse(readFileSync(resolve(root, `apps/${app}/package.json`), "utf8"))
  for (const section of ["dependencies", "devDependencies"]) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (forbiddenDependencies.has(dependency)) defects.push(`apps/${app} declares styling implementation ${dependency}`)
    }
  }
}

if (defects.length > 0) {
  console.error(defects.join("\n"))
  process.exitCode = 1
} else {
  console.log("UI ownership contracts passed")
}
