// @vitest-environment happy-dom
import { createMemoryHistory } from "@tanstack/react-router"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { makeWebRouter } from "./router.js"

const routes = [
  ["/es", "/$locale/"],
  ["/en/login", "/$locale/login"],
  ["/es/password-recovery", "/$locale/password-recovery/"],
  ["/en/password-recovery/code", "/$locale/password-recovery/code"],
  ["/es/password-recovery/new-password", "/$locale/password-recovery/new-password"],
  ["/en/password-recovery/done", "/$locale/password-recovery/done"],
  ["/es/app", "/$locale/app"],
] as const

describe("web route tree", () => {
  for (const [pathname, fullPath] of routes) {
    it(`matches ${pathname}`, () => Effect.runPromise(Effect.gen(function*() {
      const router = makeWebRouter(createMemoryHistory({
        initialEntries: [pathname],
      }))
      yield* Effect.promise(() => router.load())

      expect(router.state.location.pathname).toBe(pathname)
      expect(router.state.matches.at(-1)?.fullPath).toBe(fullPath)
      expect(router.state.matches.every((match) => match.loaderData === undefined)).toBe(true)
    })))
  }

  it("builds typed locale destinations", () => {
    const router = makeWebRouter(createMemoryHistory())
    expect(router.buildLocation({
      to: "/$locale/password-recovery/code",
      params: { locale: "en" },
      search: {},
    }).href).toBe("/en/password-recovery/code")
  })
})
