// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { reopenRun, runDeterministicScenario } from "./app.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("local/CI composition root", () => {
  it("runs the deterministic engineering vertical and reopens its PGlite result", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "agent-cli-test-")); roots.push(root)
    const database = resolve(root, "runs.pglite")
    const report = await runDeterministicScenario({ database, write: () => undefined })
    expect(report.run.status).toBe("Succeeded")
    expect(report.validation).toBe("passed")
    expect(report.run.usage.turns).toBe(4)
    expect(report.events.map((event) => event.sequence)).toEqual(report.events.map((_, index) => index + 1))
    expect(await reopenRun(database)).toMatchObject({ id: report.run.id, status: "Succeeded", output: "Prepared and validated deterministic change." })
  })

  it("cleans a temporary sandbox after the scoped executable completes", async () => {
    const report = await runDeterministicScenario({ database: ":memory:", write: () => undefined })
    expect(report.workspaceExistsBeforeClose).toBe(true)
    expect(existsSync(report.workspace)).toBe(false)
  })

  it("uses but does not remove the current CI workspace", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "agent-cli-workspace-")); roots.push(root)
    const report = await runDeterministicScenario({ database: resolve(root, "runs.pglite"), workspace: root, write: () => undefined })
    expect(readFileSync(resolve(root, "work/greeting.txt"), "utf8")).toBe("hello deterministic agent\n")
    expect(existsSync(root)).toBe(true)
    expect(report.workspace).toBe(root)
  })
})
