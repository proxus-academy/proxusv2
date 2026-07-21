// @vitest-environment happy-dom
import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

describe("mobile web composition root", () => {
  it("stays available and exposes canonicalization failures when History replacement is blocked", () => Effect.runPromise(Effect.gen(function*() {
    history.replaceState(
      { preserved: true },
      "",
      "/legacy?campaign=mobile&path=not-json#summary",
    )
    localStorage.setItem("proxus.product-locale.v1", "{\"version\":1,\"locale\":\"es\"}")
    const applyReplaceState = history.replaceState.bind(history)
    const blocked = new Error("history blocked")
    const replaceState = vi.spyOn(history, "replaceState").mockImplementation(() => {
      throw blocked
    })
    let dispose: (() => Promise<void>) | undefined

    try {
      const { composition } = yield* Effect.promise(() => import("./composition.js"))
      dispose = composition.dispose
      const registry = AtomRegistry.make()

      registry.set(composition.locale.canonicalizeLocaleAtom, undefined)
      registry.set(
        composition.registration.canonicalizeRegistrationPathAtom,
        registry.get(composition.router.location),
      )

      expect(registry.get(composition.registration.registrationPathAtom)).toEqual([])
      expect(registry.get(composition.navigation.failedAtom)).toBe(true)
      expect(location.href).toBe("http://localhost:3000/legacy?campaign=mobile&path=not-json#summary")
      expect(history.state).toEqual({ preserved: true })

      replaceState.mockImplementation(applyReplaceState)
      registry.set(composition.navigation.retryAtom, undefined)
      yield* AtomRegistry.getResult(
        registry,
        composition.navigation.retryAtom,
        { suspendOnWaiting: true },
      )
      expect(registry.get(composition.navigation.failedAtom)).toBe(false)
      expect(location.href).toBe("http://localhost:3000/es?campaign=mobile#summary")
      expect(history.state).toEqual({ preserved: true })
    } finally {
      replaceState.mockRestore()
      if (dispose !== undefined) yield* Effect.promise(dispose)
      localStorage.clear()
      history.replaceState(null, "", "/")
    }
  })))
})
