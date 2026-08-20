import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { build } from "esbuild"

const output = new URL("../dist/preview-runtime/", import.meta.url)
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

const entries = {
  api: new URL("../apps/preview-server/src/main.ts", import.meta.url),
  initialize: new URL("../apps/preview-server/src/initialize.ts", import.meta.url),
}
for (const [name, entry] of Object.entries(entries)) {
  const outfile = new URL(`${name}.mjs`, output)
  await build({
    entryPoints: [entry.pathname],
    outfile: outfile.pathname,
    bundle: true,
    format: "esm",
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
    platform: "node",
    target: "node22",
    sourcemap: false,
    legalComments: "none",
    external: ["pg-native"],
    logLevel: "info",
  })
  const artifact = readFileSync(outfile, "utf8")
  for (const forbidden of ["@electric-sql/pglite", "@effect/sql-pglite", "PGLITE_DATA_DIR", "apps/dev-server", "tsx", "typescript/lib"]) {
    if (artifact.includes(forbidden)) throw new Error(`${name} runtime contains forbidden content: ${forbidden}`)
  }
}

cpSync(new URL("../packages/backend-infra/drizzle", import.meta.url), new URL("drizzle", output), { recursive: true })
cpSync(new URL("../apps/web/dist", import.meta.url), new URL("web", output), { recursive: true })
cpSync(new URL("../apps/admin/dist", import.meta.url), new URL("admin", output), { recursive: true })
cpSync(new URL("../apps/storybook/storybook-static", import.meta.url), new URL("ui", output), { recursive: true })
