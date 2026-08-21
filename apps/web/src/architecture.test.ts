/// <reference types="vite/client" />
import { describe, expect, it } from "vitest"

// SAFETY: Vite expands this static glob to modules whose default exports are irrelevant to this architecture test.
const modules = import.meta.glob([
  "./**/*.{ts,tsx}",
  "../../../packages/frontend-core/src/**/*.{ts,tsx}",
], { eager: true, import: "default", query: "?raw" }) as Readonly<Record<string, string>>

const productionOnly = ([path]: readonly [string, string]) =>
  !/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/.test(path)
const entries = Object.entries(modules).filter(productionOnly)
const appFiles = entries.filter(([path]) => path.startsWith("./"))
const coreFiles = entries.filter(([path]) => path.includes("packages/frontend-core/src/"))

describe("frontend architecture boundaries", () => {
  it("keeps the composition root out of product modules", () => {
    for (const [path, source] of appFiles) {
      expect(source, path).not.toMatch(/from ["'][^"']*composition(?:\.js)?["']/)
      expect(source, path).not.toMatch(/\bcomposition\.[A-Za-z]/)
    }
  })

  it("keeps visual shells independent from atoms and Effect services", () => {
    const visualModules = appFiles.filter(([path]) =>
      path.endsWith("/auth-shell.tsx") ||
      path.endsWith("/registration-shell.tsx") ||
      path.endsWith("/auth-controls.tsx"))
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
      expect(source, path).not.toMatch(/from ["'](?:react|@effect\/atom-react|@lucas-barake\/effect-form-react)["']/)
    }
  })

  it("does not maintain a parallel SPA navigation abstraction", () => {
    for (const [path, source] of appFiles) {
      expect(source, path).not.toMatch(/export const navigateTo[A-Z]\w*Action/)
      expect(source, path).not.toMatch(/\bnavigateAction\b|\bNavigationDestination\b|\bWebNavigationError\b/)
      expect(source, path).not.toMatch(/routes\/navigation(?:\.js)?["']/)
    }
  })

  it("leaves browser History writes to TanStack Router", () => {
    const writers = appFiles
      .filter(([, source]) => /history\.(?:pushState|replaceState)\(/.test(source))
      .map(([path]) => path.replace(/^\.\.\/\.\.\/\.\.\//, ""))
    expect(writers).toEqual([])
  })

  it("keeps route definitions free of router-owned data lifecycles", () => {
    const routeFiles = appFiles.filter(([path]) =>
      path.includes("/routes/") && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path))
    expect(routeFiles.length).toBeGreaterThan(1)
    for (const [path, source] of routeFiles) {
      expect(source, path).not.toMatch(/\b(?:loader|beforeLoad)\s*:/)
    }
  })

  it("keeps neutral atoms independent from URL and browser globals", () => {
    for (const [path, source] of coreFiles) {
      expect(source, path).not.toMatch(/@tanstack\/react-router/)
      expect(source, path).not.toMatch(/\b(?:window|document|history|location)\./)
    }
  })

  it("reserves DocumentNavigation for full-document navigation", () => {
    const users = appFiles.filter(([, source]) => /\bDocumentNavigation\b/.test(source))
    expect(users.length).toBeGreaterThan(0)
    for (const [path] of users) expect(path, path).toMatch(/(?:modules\/(?:auth|registration)|platform\/routing)/)
  })

  it("uses Paraglide generated messages without a translation compatibility layer", () => {
    for (const [path, source] of appFiles) {
      expect(source, path).not.toMatch(/useTranslation|ProductLocaleProvider|LocaleContext|Reflect\.(?:get|apply)/)
      expect(source, path).not.toMatch(/platform\/product-locale/)
    }
  })

  it("keeps TanStack Router behind the web routing boundary", () => {
    const importers = appFiles
      .filter(([, source]) => /from ["']@tanstack\/react-router["']/.test(source))
      .map(([path]) => path.replace(/^\.\//, ""))
    expect(importers.every((path) =>
      path === "modules/auth/layouts.tsx" || path.startsWith("routes/"),
    ), importers.join("\n")).toBe(true)
  })
})
