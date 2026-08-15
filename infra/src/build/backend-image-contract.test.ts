// @effect-diagnostics nodeBuiltinImport:off
import { execFileSync } from "node:child_process"
import { accessSync, constants, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const repository = resolve(import.meta.dirname, "../../..")
const dockerfile = readFileSync(resolve(repository, "infra/docker/Dockerfile.backend"), "utf8")
const migrationJob = readFileSync(resolve(repository, "infra/src/alchemy/components/migration-job.ts"), "utf8")
const bootstrapJob = readFileSync(resolve(repository, "infra/src/alchemy/components/preview-database-grants.ts"), "utf8")
const buildScript = resolve(repository, "infra/src/build/build-backend.mjs")
const output = resolve(repository, "dist/production-backend")

const declaredNodeEntrypoint = (source: string): string => {
  const match = source.match(/command: \["node"\],[\s\S]*?args: \["\/app\/(.+?\.mjs)"\]/)
  if (match?.[1] === undefined) throw new Error("Job does not declare a node entrypoint under /app")
  return match[1]
}

describe("backend image executable contract", () => {
  it("packages every executable declared by the database Jobs", () => {
    execFileSync(process.execPath, [buildScript], { cwd: repository, stdio: "pipe" })

    const entrypoints = [declaredNodeEntrypoint(migrationJob), declaredNodeEntrypoint(bootstrapJob)]
    expect(entrypoints).toEqual(["migrate.mjs", "database-bootstrap.mjs"])
    expect(dockerfile).toContain("COPY --from=build --chown=node:node /workspace/dist/production-backend/ /app/")

    for (const entrypoint of entrypoints) {
      const artifact = resolve(output, entrypoint)
      accessSync(artifact, constants.R_OK)
      execFileSync(process.execPath, ["--check", artifact], { cwd: repository, stdio: "pipe" })
      expect(dockerfile).toContain(`test -r dist/production-backend/${entrypoint}`)
    }
  })
})
