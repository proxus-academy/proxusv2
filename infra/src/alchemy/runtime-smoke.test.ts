// Subprocess smoke tests exercise the real tsx resolver and executable argument boundary without cloud access.
// @effect-diagnostics nodeBuiltinImport:off
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const infraRoot = resolve(import.meta.dirname, "../..")
const tsx = resolve(infraRoot, "node_modules/.bin/tsx")

describe("Alchemy runtime loading", () => {
  it("imports the complete live provider graph through tsx", () => {
    const result = spawnSync(tsx, ["--eval", 'import("./src/alchemy/providers/index.ts")'], { cwd: infraRoot, encoding: "utf8" })
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" })
  }, 20_000)

  it("reads persisted bootstrap outputs through beta.65 without reconciling", () => {
    const stateRoot = resolve(infraRoot, ".alchemy")
    const output = {
      bucket: "proxus-v2-pulumi-state",
      key: "projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state/cryptoKeys/pulumi-secrets",
    }
    mkdirSync(resolve(stateRoot, "state/bootstrap/bootstrap"), { recursive: true })
    writeFileSync(resolve(stateRoot, "state/bootstrap/bootstrap/__stack_output__.json"), JSON.stringify(output))
    try {
      const result = spawnSync(tsx, ["src/alchemy/cli.ts", "outputs", "--stage", "bootstrap"], {
        cwd: infraRoot, encoding: "utf8", env: {
          ...process.env,
          GCP_PROJECT_ID: "proxus-v2",
          GCP_REGION: "europe-southwest1",
          ALCHEMY_STATE_BUCKET: "proxus-v2-pulumi-state",
          ALCHEMY_STATE_KEY_RING_ID: "pulumi-state",
          ALCHEMY_STATE_CRYPTO_KEY_ID: "pulumi-secrets",
          GCP_OPERATOR_PRINCIPAL: "user:smoke@example.com",
        },
      })
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual(output)
    } finally {
      rmSync(stateRoot, { recursive: true, force: true })
    }
  }, 60_000)

  it("accepts pnpm's leading separator at the real CLI boundary", () => {
    const result = spawnSync(tsx, ["src/alchemy/cli.ts", "--", "invalid"], { cwd: infraRoot, encoding: "utf8" })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("operation must be plan, deploy, outputs or destroy")
  }, 20_000)
})
