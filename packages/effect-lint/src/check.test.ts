import { describe, expect, it } from "vitest"
import { checkSource } from "./check.js"

describe("effect platform replacement lint", () => {
  it("reports native SQLite imports with an Effect SQL replacement", () => {
    const diagnostics = checkSource("/repo", "/repo/store.ts", 'import { DatabaseSync } from "node:sqlite"\n')
    expect(diagnostics).toEqual([expect.objectContaining({
      ruleId: "no-native-sqlite",
      file: "store.ts",
      moduleName: "node:sqlite",
      line: 1,
    })])
    expect(diagnostics[0]?.alternatives).toContain("@effect/sql-sqlite-node")
  })

  it("reports dotenv imports and side-effect imports", () => {
    const diagnostics = checkSource("/repo", "/repo/config.ts", 'import "dotenv/config"\nconst dotenv = require("dotenv")\n')
    expect(diagnostics.map((item) => item.ruleId)).toEqual(["no-dotenv", "no-dotenv"])
  })

  it("reports dynamic imports", () => {
    const diagnostics = checkSource("/repo", "/repo/store.ts", 'const sqlite = import("better-sqlite3")')
    expect(diagnostics[0]).toEqual(expect.objectContaining({ ruleId: "no-native-sqlite" }))
  })

  it("does not duplicate Effect LSP expression diagnostics", () => {
    const source = `
      const environment = process.env.NODE_ENV
      const response = fetch("https://example.test")
      setTimeout(() => undefined, 1)
    `
    expect(checkSource("/repo", "/repo/app.ts", source)).toEqual([])
  })
})
