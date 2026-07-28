import {
  compile,
  index,
  makeRouterService,
  path,
  root,
  RouteEncodingError,
  type DestinationOf,
} from "@proxus/frontend-core/routing"
import { Deferred, Effect, Layer, Schema } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { browserRouterLayer, type BrowserNavigation } from "./browser-router.js"

const definition = root({ id: "root", children: [
  index({ id: "home" }),
  path({ id: "studies", path: "studies" }),
  path({
    id: "search",
    path: "search",
    query: Schema.Struct({
      id: Schema.String,
      page: Schema.optional(Schema.NumberFromString),
    }),
  }),
  path({ id: "not-found", path: "not-found" }),
] })
const routes = compile(definition)
type TestDestination = DestinationOf<typeof definition>
const Router = makeRouterService<TestDestination>("@proxus/web/platform/routing/test/Router")

const makeNavigation = (initial: string) => {
  let url = new URL(initial)
  let historyState: unknown = { preserved: true }
  let currentUrlReads = 0
  let backFailure: Error | undefined
  const listeners = new Set<() => void>()
  const calls: Array<{ readonly operation: "push" | "replace"; readonly url: string; readonly state: unknown }> = []
  const navigation: BrowserNavigation = {
    currentUrl: () => {
      currentUrlReads++
      return new URL(url)
    },
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
    back: () => {
      if (backFailure !== undefined) throw backFailure
    },
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
    get currentUrlReads() {
      return currentUrlReads
    },
    failBack(error: Error) {
      backFailure = error
    },
    pop(next: string) {
      url = new URL(next)
      listeners.forEach((listener) => listener())
    },
  }
}

const notFound = () => routes.destination("not-found")

describe("browser router", () => {
  it("captures one URL per transition and preserves search, hash, and history state", () => {
    const browser = makeNavigation("https://proxus.test/?lang=en#summary")
    const program = Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, routes, {
        navigation: browser.navigation,
        notFound,
      }))
      yield* Effect.gen(function*() {
        const router = yield* Router
        const registry = AtomRegistry.make()
        expect(registry.get(router.current).id).toBe("home")
        yield* router.pushDestination(routes.destination("studies"), { search: "campaign=winter" })
        expect(registry.get(router.location)).toMatchObject({
          destination: { id: "studies" },
          matches: [{ id: "root" }, { id: "studies" }],
          search: "campaign=winter",
        })
      }).pipe(Effect.provide(context))
    }))

    return Effect.runPromise(program).then(() => {
      expect(browser.currentUrlReads).toBe(2)
      expect(browser.calls).toEqual([{
        operation: "push",
        url: "https://proxus.test/studies?campaign=winter#summary",
        state: { preserved: true },
      }])
      expect(browser.listeners.size).toBe(0)
    })
  })

  it("encodes and decodes route-specific query schemas through navigate", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const browser = makeNavigation("https://proxus.test/search?id=initial&page=2")
    const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, routes, {
      navigation: browser.navigation,
      notFound,
    }))
    yield* Effect.gen(function*() {
      const router = yield* Router
      const registry = AtomRegistry.make()
      expect(registry.get(router.current)).toMatchObject({
        id: "search",
        query: { id: "initial", page: 2 },
      })

      yield* router.navigate("search", { query: { id: "next", page: 3 } })
      expect(registry.get(router.location)).toMatchObject({
        destination: { id: "search", query: { id: "next", page: 3 } },
        matches: [{ id: "root" }, { id: "search" }],
        search: "id=next&page=3",
      })
      expect(browser.calls.at(-1)?.url).toBe("https://proxus.test/search?id=next&page=3")
    }).pipe(Effect.provide(context))
  }))))

  it("applies only the latest overlapping popstate decode", () => Effect.runPromise(Effect.gen(function*() {
    const browser = makeNavigation("https://proxus.test/")
    const slowStarted = yield* Deferred.make<void>()
    const slowCleanup = yield* Deferred.make<void>()
    const slowBlock = yield* Deferred.make<void>()
    const studiesObserved = yield* Deferred.make<void>()
    const delayedRoutes = {
      ...routes,
      decode: (pathname: string) => pathname === "/slow"
        ? Effect.sync(() => {
          Deferred.doneUnsafe(slowStarted, Effect.void)
        }).pipe(
          Effect.andThen(Deferred.await(slowBlock)),
          Effect.andThen(routes.decode("/")),
          Effect.ensuring(Deferred.succeed(slowCleanup, undefined)),
        )
        : routes.decode(pathname),
    }

    yield* Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, delayedRoutes, {
        navigation: browser.navigation,
        notFound,
      }))
      yield* Effect.gen(function*() {
        const router = yield* Router
        const registry = AtomRegistry.make()
        const unsubscribe = registry.subscribe(router.current, (destination) => {
          if (destination.id === "studies") Deferred.doneUnsafe(studiesObserved, Effect.void)
        }, { immediate: true })

        browser.pop("https://proxus.test/slow?attempt=first")
        yield* Deferred.await(slowStarted)
        browser.pop("https://proxus.test/studies?attempt=latest")
        yield* Deferred.await(slowCleanup)
        yield* Deferred.await(studiesObserved)
        expect(registry.get(router.location)).toMatchObject({
          destination: { id: "studies" },
          search: "attempt=latest",
        })
        unsubscribe()
      }).pipe(Effect.provide(context))
    }))
  })))

  it("waits for active popstate cleanup before releasing the router layer", () => Effect.runPromise(Effect.gen(function*() {
    const browser = makeNavigation("https://proxus.test/")
    const started = yield* Deferred.make<void>()
    const cleaned = yield* Deferred.make<void>()
    const block = yield* Deferred.make<void>()
    const blockingRoutes = {
      ...routes,
      decode: (pathname: string) => pathname === "/blocking"
        ? Effect.sync(() => {
          Deferred.doneUnsafe(started, Effect.void)
        }).pipe(
          Effect.andThen(Deferred.await(block)),
          Effect.andThen(routes.decode("/")),
          Effect.ensuring(Deferred.succeed(cleaned, undefined)),
        )
        : routes.decode(pathname),
    }

    yield* Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, blockingRoutes, {
        navigation: browser.navigation,
        notFound,
      }))
      yield* Effect.gen(function*() {
        yield* Router
        browser.pop("https://proxus.test/blocking")
        yield* Deferred.await(started)
      }).pipe(Effect.provide(context))
    }))

    yield* Deferred.await(cleaned)
    expect(browser.listeners.size).toBe(0)
  })))

  it("reacts to browser history and represents unknown paths explicitly", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const browser = makeNavigation("https://proxus.test/studies")
    const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, routes, {
      navigation: browser.navigation,
      notFound,
    }))
    yield* Effect.gen(function*() {
      const router = yield* Router
      const registry = AtomRegistry.make()
      const notFoundObserved = yield* Deferred.make<void>()
      const unsubscribe = registry.subscribe(router.error, (error) => {
        if (error?._tag === "RouteNotFound") Deferred.doneUnsafe(notFoundObserved, Effect.void)
      }, { immediate: true })

      browser.pop("https://proxus.test/missing?source=history")
      yield* Deferred.await(notFoundObserved)
      expect(registry.get(router.current).id).toBe("not-found")
      expect(registry.get(router.location).search).toBe("source=history")
      unsubscribe()
    }).pipe(Effect.provide(context))
  }))))

  it("preserves typed route encoding failures", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const browser = makeNavigation("https://proxus.test/")
    const encodingFailure = new RouteEncodingError({ routeId: "studies" })
    const failingRoutes = {
      ...routes,
      encodeDestination: (_destination: TestDestination) => Effect.fail(encodingFailure),
    }
    const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, failingRoutes, {
      navigation: browser.navigation,
      notFound,
    }))
    yield* Effect.gen(function*() {
      const router = yield* Router
      const registry = AtomRegistry.make()
      const failure = yield* Effect.flip(router.pushDestination(routes.destination("studies")))
      expect(failure).toBe(encodingFailure)
      expect(registry.get(router.error)).toBe(encodingFailure)
      expect(browser.calls).toEqual([])
    }).pipe(Effect.provide(context))
  }))))

  it("publishes a typed back failure through the error atom", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const browser = makeNavigation("https://proxus.test/studies")
    browser.failBack(new Error("back unavailable"))
    const context = yield* Layer.build(browserRouterLayer<TestDestination>(Router, routes, {
      navigation: browser.navigation,
      notFound,
    }))
    yield* Effect.gen(function*() {
      const router = yield* Router
      const registry = AtomRegistry.make()
      const failure = yield* Effect.flip(router.back)
      expect(failure).toMatchObject({
        _tag: "NavigationError",
        operation: "back",
        message: "back unavailable",
      })
      expect(registry.get(router.error)).toBe(failure)
    }).pipe(Effect.provide(context))
  }))))
})
