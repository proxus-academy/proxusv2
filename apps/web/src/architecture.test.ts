/// <reference types="vite/client" />
import { describe, expect, it } from "vitest"

const modules = import.meta.glob([
  "./**/*.{ts,tsx}",
  "../../../packages/frontend-core/src/**/*.{ts,tsx}",
  "../../../packages/frontend-web/src/**/*.{ts,tsx}",
], { eager: true, import: "default", query: "?raw" }) as Readonly<Record<string, string>>

const productionOnly = ([path]: readonly [string, string]) =>
  !/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(path)
const entries = Object.entries(modules).filter(productionOnly)
const appFiles = entries.filter(([path]) => path.startsWith("./"))
const coreFiles = entries.filter(([path]) => path.includes("packages/frontend-core/src/"))
const webAdapterFiles = entries.filter(([path]) => path.includes("packages/frontend-web/src/"))

describe("frontend architecture boundaries", () => {
  it("keeps the composition root out of product modules", () => {
    for (const [path, source] of appFiles) {
      expect(source, path).not.toMatch(/from ["'][^"']*composition(?:\.js)?["']/)
      expect(source, path).not.toMatch(/\bcomposition\.[A-Za-z]/)
    }
  })

  it("keeps visual patterns independent from atoms and Effect services", () => {
    const visualModules = appFiles.filter(([path]) =>
      path.includes("/patterns/") || path.endsWith("/auth-controls.tsx"))
    expect(visualModules.length).toBeGreaterThan(0)
    for (const [path, source] of visualModules) {
      expect(source, path).not.toMatch(/@effect\/atom-react|effect\/unstable\/reactivity\/Atom/)
      expect(source, path).not.toMatch(/Context\.Service|Layer\.|Atom\.runtime/)
    }
  })

  it("does not pass atoms through React props", () => {
    for (const [path, source] of appFiles.filter(([path]) => path.endsWith(".tsx"))) {
      expect(source, path).not.toMatch(/readonly\s+\w+(?:Atom)?:\s*Atom\.(?:Atom|Writable|AtomResultFn)/)
    }
  })

  it("keeps shared frontend state React-neutral", () => {
    for (const [path, source] of coreFiles) {
      expect(source, path).not.toMatch(/from ["'](?:react|@effect\/atom-react|@proxus\/effect-form\/react)["']/)
    }
  })

  it("uses the router service instead of one action per destination", () => {
    for (const [path, source] of appFiles) {
      expect(source, path).not.toMatch(/export const navigateTo[A-Z]\w*Action/)
      expect(source, path).not.toMatch(/get\.setResult\(navigateTo[A-Z]\w*Action/)
    }
  })

  it("has one browser History writer", () => {
    const writers = [...appFiles, ...webAdapterFiles]
      .filter(([, source]) => /history\.(?:pushState|replaceState)\(/.test(source))
      .map(([path]) => path.replace(/^\.\.\/\.\.\/\.\.\//, ""))
    expect(writers).toEqual([
      "packages/frontend-web/src/routing/browser-router.ts",
    ])
  })
})
