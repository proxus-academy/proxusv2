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
  it("keeps presentational views independent from the composition root and Effect services", () => {
    const views = appFiles.filter(([path]) => /(?:-view|\/views?\/|auth-public)\.[jt]sx$/.test(path))
    for (const [path, source] of views) {
      expect(source, path).not.toMatch(/from ["'][^"']*composition(?:\.js)?["']/)
      expect(source, path).not.toMatch(/Context\.Service|Layer\.|Atom\.runtime/)
    }
  })

  it("keeps shared frontend state React-neutral", () => {
    for (const [path, source] of coreFiles) {
      expect(source, path).not.toMatch(/from ["'](?:react|@effect\/atom-react|@proxus\/effect-form\/react)["']/)
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
