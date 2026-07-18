import { compile, index, makeRouterService, path, root, type DestinationOf } from "@proxus/frontend-core/routing"
import { Effect, Layer } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { browserRouterLayer, type BrowserNavigation } from "./browser-router.js"

const definition = root({ id: "root", children: [
  index({ id: "home" }),
  path({ id: "studies", path: "studies" }),
  path({ id: "not-found", path: "not-found" }),
] })
const routes = compile(definition)
type TestDestination = DestinationOf<typeof definition>
const Router = makeRouterService<TestDestination>("@proxus/frontend-web/routing/test/Router")

const makeNavigation = (initial: string) => {
  let url = new URL(initial)
  let historyState: unknown = { preserved: true }
  const listeners = new Set<() => void>()
  const calls: Array<{ readonly operation: "push" | "replace"; readonly url: string; readonly state: unknown }> = []
  const navigation: BrowserNavigation = {
    currentUrl: () => new URL(url),
    state: () => historyState,
    pushState: (state, next) => {
      historyState = state
      url = new URL(next)
      calls.push({ operation: "push", url: url.href, state })
    },
    replaceState: (state, next) => {
      historyState = state
      url = new URL(next)
      calls.push({ operation: "replace", url: url.href, state })
    },
    back: () => undefined,
    forward: () => undefined,
    onPopState: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    calls,
    listeners,
    navigation,
    pop(next: string) {
      url = new URL(next)
      listeners.forEach((listener) => listener())
    },
  }
}

const notFound = () => routes.destination("not-found")

describe("browser router", () => {
  it("reads the initial URL and preserves search, hash, and history state", () => {
    const browser = makeNavigation("https://proxus.test/?lang=en#summary")
    const program = Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(browserRouterLayer(Router, routes, {
        navigation: browser.navigation,
        notFound,
      }))
      return yield* Effect.gen(function*() {
        const router = yield* Router
        const registry = AtomRegistry.make()
        expect(registry.get(router.current).id).toBe("home")
        yield* router.push(routes.destination("studies"))
      }).pipe(Effect.provide(context))
    }))

    Effect.runSync(program)

    expect(browser.calls).toEqual([{
      operation: "push",
      url: "https://proxus.test/studies?lang=en#summary",
      state: { preserved: true },
    }])
    expect(browser.listeners.size).toBe(0)
  })

  it("applies only the latest overlapping popstate decode", async () => {
    const browser = makeNavigation("https://proxus.test/")
    const delayedRoutes = {
      encodeDestination: routes.encodeDestination,
      decode: (pathname: string) => pathname === "/slow"
        ? routes.decode("/studies").pipe(Effect.delay("50 millis"))
        : routes.decode(pathname),
    }
    const program = Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(browserRouterLayer(Router, delayedRoutes, {
        navigation: browser.navigation,
        notFound,
      }))
      return yield* Effect.gen(function*() {
        const router = yield* Router
        const registry = AtomRegistry.make()
        browser.pop("https://proxus.test/slow")
        browser.pop("https://proxus.test/")
        yield* Effect.sleep("80 millis")
        expect(registry.get(router.current).id).toBe("home")
      }).pipe(Effect.provide(context))
    }))
    await Effect.runPromise(program)
    expect(browser.listeners.size).toBe(0)
  })

  it("reacts to browser history and represents unknown paths explicitly", () => {
    const browser = makeNavigation("https://proxus.test/studies")
    const program = Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(browserRouterLayer(Router, routes, {
        navigation: browser.navigation,
        notFound,
      }))
      return yield* Effect.gen(function*() {
        const router = yield* Router
        const registry = AtomRegistry.make()
        browser.pop("https://proxus.test/missing")
        yield* Effect.yieldNow
        expect(registry.get(router.current).id).toBe("not-found")
        expect(registry.get(router.error)?._tag).toBe("RouteNotFound")
      }).pipe(Effect.provide(context))
    }))

    Effect.runSync(program)
  })
})
