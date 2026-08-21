// @vitest-environment happy-dom
import { createMemoryHistory } from "@tanstack/react-router"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { overwriteGetLocale } from "../paraglide/runtime.js"
import { makeWebRouter } from "./router.js"

const routes = [
  ["/es", "/"],
  ["/en/login", "/login"],
  ["/es/password-recovery", "/password-recovery/"],
  ["/en/password-recovery/code", "/password-recovery/code"],
  ["/es/password-recovery/new-password", "/password-recovery/new-password"],
  ["/en/password-recovery/done", "/password-recovery/done"],
  ["/es/app", "/app"],
] as const

describe("web route tree", () => {
  for (const [pathname, fullPath] of routes) {
    it(`matches localized URL ${pathname} as internal route ${fullPath}`, () => Effect.runPromise(Effect.gen(function*() {
      const router = makeWebRouter(createMemoryHistory({
        initialEntries: [pathname],
      }))
      yield* Effect.promise(() => router.load())

      expect(router.state.matches.at(-1)?.fullPath).toBe(fullPath)
      expect(router.state.matches.every((match) => match.loaderData === undefined)).toBe(true)
    })))
  }

  it("builds localized URLs from typed internal destinations", () => Effect.runPromise(Effect.gen(function*() {
    overwriteGetLocale(() => "en")
    const router = makeWebRouter(createMemoryHistory({ initialEntries: ["/en"] }))
    yield* Effect.promise(() => router.load())
    yield* Effect.promise(() => router.navigate({
      to: "/password-recovery/code",
      search: {},
    }))
    expect(router.history.location.href).toBe("/en/password-recovery/code")
  })))

  it("keeps localized routes below a deployment base path", () => Effect.runPromise(Effect.gen(function*() {
    overwriteGetLocale(() => "es")
    const router = makeWebRouter(createMemoryHistory({ initialEntries: ["/app"] }), "/app")
    yield* Effect.promise(() => router.load())

    expect(router.state.matches.at(-1)?.fullPath).toBe("/")
    yield* Effect.promise(() => router.navigate({ to: "/login" }))
    expect(router.history.location.href).toBe("/app/login")
  })))

  it("keeps English routes below a deployment base path", () => Effect.runPromise(Effect.gen(function*() {
    overwriteGetLocale(() => "en")
    const router = makeWebRouter(createMemoryHistory({ initialEntries: ["/app/en"] }), "/app")
    yield* Effect.promise(() => router.load())

    expect(router.state.matches.at(-1)?.fullPath).toBe("/")
    yield* Effect.promise(() => router.navigate({ to: "/login" }))
    expect(router.history.location.href).toBe("/app/en/login")
  })))
})
