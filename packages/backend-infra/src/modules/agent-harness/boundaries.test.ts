// @effect-diagnostics nodeBuiltinImport:off
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../")
const walk = (directory: string, extension: string): ReadonlyArray<string> => readdirSync(directory).flatMap((name) => {
  const path = resolve(directory, name)
  return statSync(path).isDirectory() && name !== "node_modules" && name !== ".repos" ? walk(path, extension) : path.endsWith(extension) ? [path] : []
})
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, any>

describe("agent harness architecture boundaries", () => {
  test("pins one exact Effect beta in every workspace manifest", () => {
    const manifests = ["package.json", ...walk(resolve(root, "apps"), "package.json"), ...walk(resolve(root, "packages"), "package.json")]
    const versions = manifests.flatMap((path) => {
      const manifest = JSON.parse(readFileSync(path, "utf8"))
      return ["dependencies", "devDependencies", "peerDependencies"].flatMap((section) => Object.entries(manifest[section] ?? {})).filter(([name]) => name === "effect" || name.startsWith("@effect/")).filter(([name]) => name !== "@effect/language-service").map(([name, version]) => ({ path, name, version }))
    })
    expect(versions.every(({ version }) => version === "4.0.0-beta.98")).toBe(true)
  })

  test("keeps core free of infrastructure, providers, credentials and unstable AI except its localized adapter", () => {
    const files = walk(resolve(root, "packages/agent-harness/src"), ".ts")
    for (const path of files) {
      const source = readFileSync(path, "utf8")
      expect(source).not.toMatch(/from ["'](?:node:|@proxus\/backend-infra|drizzle-orm|@effect\/sql|pg(?:["']))/)
      expect(source).not.toMatch(/(?:OPENAI|ANTHROPIC|GITHUB_TOKEN|DATABASE_URL)/)
      if (!path.endsWith("/ai/effect-ai.ts")) expect(source).not.toContain("effect/unstable/ai")
    }
  })

  test("exports only declared narrow infrastructure files and apps do not import internals", () => {
    const manifest = json("packages/backend-infra/package.json")
    expect(manifest.exports["."]).toBeUndefined()
    for (const [subpath, target] of Object.entries<string>(manifest.exports)) {
      expect(subpath).not.toContain("*")
      expect(existsSync(resolve(root, "packages/backend-infra", target))).toBe(true)
    }
    for (const path of walk(resolve(root, "apps"), ".ts")) {
      expect(readFileSync(path, "utf8")).not.toMatch(/@proxus\/(?:agent-harness|backend-infra)\/src\//)
    }
  })

  test("keeps local documentation links and executable manifest entries valid", () => {
    for (const path of walk(resolve(root, "docs"), ".md")) {
      const source = readFileSync(path, "utf8")
      for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const link = match[1]!.split("#", 1)[0]!
        if (link === "" || /^(?:https?:|mailto:)/.test(link)) continue
        expect(existsSync(resolve(dirname(path), link)), `${path}: ${link}`).toBe(true)
      }
    }
    for (const name of ["agent-cli", "agent-worker", "google-chat-agent"]) {
      const manifest = json(`apps/${name}/package.json`)
      for (const command of Object.values<string>(manifest.scripts ?? {})) {
        const source = command.match(/(?:tsx|node)\s+([^ ]+\.ts)/)?.[1]
        if (source !== undefined) expect(existsSync(resolve(root, `apps/${name}`, source))).toBe(true)
      }
    }
  })
})
