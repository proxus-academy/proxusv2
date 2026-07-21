import { makeRetryableCommands } from "@proxus/frontend-core/navigation"
import {
  compile,
  index,
  makeObservableValue,
  NavigationError,
  param,
  root,
  type DestinationOf,
  type RouterObservableError,
  type RouterService,
} from "@proxus/frontend-core/routing"
import { Locale, type Locale as LocaleType } from "@proxus/product-messages"
import { Cause, Deferred, Effect, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import {
  canonicalLocalePlan,
  makeCanonicalLocaleAtoms,
  makeRouterProductLocaleAtoms,
} from "./router-locale.web.js"

const definition = root({
  id: "root",
  children: [
    param({
      id: "locale",
      name: "locale",
      schema: Locale,
      children: [index({ id: "registration" })],
    }),
  ],
})
const routes = compile(definition)
type Destination = DestinationOf<typeof definition>
const destination = (locale: LocaleType) => routes.destination("registration", { locale })

const canonicalCases: ReadonlyArray<{
  readonly name: string
  readonly initial: string
  readonly preferred: LocaleType
  readonly expected: string
}> = [
  {
    name: "path locale",
    initial: "https://proxus.test/en?campaign=one#summary",
    preferred: "es",
    expected: "https://proxus.test/en?campaign=one#summary",
  },
  {
    name: "trailing slash path locale",
    initial: "https://proxus.test/en/?campaign=one#summary",
    preferred: "es",
    expected: "https://proxus.test/en?campaign=one#summary",
  },
  {
    name: "legacy query locale",
    initial: "https://proxus.test/?lang=en&campaign=one#summary",
    preferred: "es",
    expected: "https://proxus.test/en?campaign=one#summary",
  },
  {
    name: "stored preference",
    initial: "https://proxus.test/?campaign=one#summary",
    preferred: "en",
    expected: "https://proxus.test/en?campaign=one#summary",
  },
  {
    name: "device fallback",
    initial: "https://proxus.test/legacy?campaign=one#summary",
    preferred: "es",
    expected: "https://proxus.test/es?campaign=one#summary",
  },
  {
    name: "path wins over conflicting legacy query",
    initial: "https://proxus.test/es?lang=en&campaign=one#summary",
    preferred: "en",
    expected: "https://proxus.test/es?campaign=one#summary",
  },
]

describe("browser product locale", () => {
  it.each(canonicalCases)("canonicalizes $name without losing query or hash", ({ initial, preferred, expected }) => {
    const plan = Effect.runSync(canonicalLocalePlan({
      url: new URL(initial),
      routes,
      destination,
      preferredLocale: preferred,
    }))

    expect(plan.url.href).toBe(expected)
    expect(plan.locale).toBe(new URL(expected).pathname.slice(1))
    expect(plan.shouldReplace).toBe(initial !== expected)
  })

  it("keeps canonical replacement scoped, observable, and retryable without applying document state early", () => Effect.runPromise(Effect.gen(function*() {
    let url = new URL("https://proxus.test/?campaign=one#summary")
    let replaceFailure: NavigationError | undefined = new NavigationError({ operation: "replace", message: "history blocked" })
    const initial = destination("es")
    const current = makeObservableValue<Destination>(initial)
    const location = makeObservableValue({ destination: initial, search: "campaign=one" })
    const error = makeObservableValue<RouterObservableError | undefined>(undefined)
    const firstAttempt = yield* Deferred.make<void>()
    const secondAttempt = yield* Deferred.make<void>()
    let attempts = 0
    const router: RouterService<Destination> = {
      current: current.atom,
      location: location.atom,
      error: error.atom,
      push: () => Effect.void,
      replace: (next, options) => Effect.suspend(() => {
        attempts++
        if (attempts === 1) Deferred.doneUnsafe(firstAttempt, Effect.void)
        if (replaceFailure !== undefined) {
          error.set(replaceFailure)
          return Effect.fail(replaceFailure)
        }
        const search = options?.search ?? location.get().search
        url.pathname = `/${next.params.locale}`
        url.search = search.length === 0 ? "" : `?${search}`
        current.set(next)
        location.set({ destination: next, search })
        error.set(undefined)
        Deferred.doneUnsafe(secondAttempt, Effect.void)
        return Effect.void
      }),
      back: Effect.void,
      forward: Effect.void,
    }
    const documentLocales: Array<LocaleType> = []
    const navigation = makeRetryableCommands()
    const canonical = makeCanonicalLocaleAtoms({
      router,
      routes,
      destination,
      preferredLocale: () => "es",
      currentUrl: () => new URL(url),
      applyDocumentLocale: (locale) => { documentLocales.push(locale) },
      runner: navigation,
    })
    const registry = AtomRegistry.make()
    const unmount = registry.mount(canonical.localeLifecycleAtom)

    yield* Deferred.await(firstAttempt)
    expect(AsyncResult.isFailure(registry.get(canonical.canonicalizeLocaleAtom))).toBe(true)
    expect(registry.get(navigation.failedAtom)).toBe(true)
    expect(documentLocales).toEqual([])
    expect(url.pathname).toBe("/")

    replaceFailure = undefined
    registry.set(navigation.retryAtom, undefined)
    yield* Deferred.await(secondAttempt)
    yield* AtomRegistry.getResult(registry, navigation.retryAtom, { suspendOnWaiting: true })
    expect(url.href).toBe("https://proxus.test/es?campaign=one#summary")
    expect(documentLocales).toEqual(["es"])
    expect(attempts).toBe(2)
    expect(registry.get(navigation.failedAtom)).toBe(false)
    unmount()
  })))

  const assertRetriableLocaleCommand = (operation: "select" | "device") => {
    const initial = destination("es")
    const current = makeObservableValue<Destination>(initial)
    const location = makeObservableValue({ destination: initial, search: "campaign=one" })
    const error = makeObservableValue<RouterObservableError | undefined>(undefined)
    const failure = new NavigationError({ operation: "replace", message: "history blocked" })
    const attempts: Array<{ readonly destination: Destination; readonly search: string }> = []
    let replaceFailure: NavigationError | undefined = failure
    const router: RouterService<Destination> = {
      current: current.atom,
      location: location.atom,
      error: error.atom,
      push: () => Effect.void,
      replace: (next, options) => Effect.suspend(() => {
        const search = options?.search ?? location.get().search
        attempts.push({ destination: next, search })
        if (replaceFailure !== undefined) return Effect.fail(replaceFailure)
        current.set(next)
        location.set({ destination: next, search })
        return Effect.void
      }),
      back: Effect.void,
      forward: Effect.void,
    }
    const sideEffects: Array<string> = []
    const navigation = makeRetryableCommands()
    const atoms = makeRouterProductLocaleAtoms({
      router,
      destination,
      deviceLocale: () => "en",
      persistLocale: (locale) => { sideEffects.push(`persist:${locale}`) },
      clearLocalePreference: () => { sideEffects.push("clear") },
      applyDocumentLocale: (locale) => { sideEffects.push(`document:${locale}`) },
      runner: navigation,
    })
    const registry = AtomRegistry.make()

    if (operation === "select") registry.set(atoms.selectLocaleAtom, "en")
    else registry.set(atoms.useDeviceLocaleAtom, undefined)

    expect(registry.get(navigation.failedAtom)).toBe(true)
    expect(sideEffects).toEqual([])

    replaceFailure = undefined
    registry.set(navigation.retryAtom, undefined)
    AsyncResult.getOrThrow(registry.get(navigation.retryAtom))

    expect(attempts).toEqual([
      { destination: destination("en"), search: "campaign=one" },
      { destination: destination("en"), search: "campaign=one" },
    ])
    expect(sideEffects).toEqual(operation === "select"
      ? ["persist:en", "document:en"]
      : ["clear", "document:en"])
    expect(registry.get(navigation.failedAtom)).toBe(false)
  }

  it("retries the exact failed locale selection command", () => {
    assertRetriableLocaleCommand("select")
  })

  it("retries the exact failed device-locale command", () => {
    assertRetriableLocaleCommand("device")
  })

  it("keeps router, storage, and document failures observable and ordered", () => {
    const initial = destination("es")
    const current = makeObservableValue<Destination>(initial)
    const location = makeObservableValue({ destination: initial, search: "campaign=one" })
    const error = makeObservableValue<RouterObservableError | undefined>(undefined)
    const failure = new NavigationError({ operation: "replace", message: "history blocked" })
    const router: RouterService<Destination> = {
      current: current.atom,
      location: location.atom,
      error: error.atom,
      push: () => Effect.void,
      replace: () => Effect.fail(failure).pipe(
        Effect.tapError((cause) => Effect.sync(() => error.set(cause))),
      ),
      back: Effect.void,
      forward: Effect.void,
    }
    const sideEffects: Array<string> = []
    const atoms = makeRouterProductLocaleAtoms({
      router,
      destination,
      deviceLocale: () => "en",
      persistLocale: (locale) => { sideEffects.push(`persist:${locale}`) },
      clearLocalePreference: () => { sideEffects.push("clear") },
      applyDocumentLocale: (locale) => { sideEffects.push(`document:${locale}`) },
      runner: makeRetryableCommands(),
    })
    const registry = AtomRegistry.make()

    registry.set(atoms.selectLocaleAtom, "en")
    const result = registry.get(atoms.selectLocaleAtom)
    expect(AsyncResult.isFailure(result)).toBe(true)
    if (AsyncResult.isFailure(result)) {
      expect(Option.getOrThrow(Cause.findErrorOption(result.cause))).toBe(failure)
    }
    expect(registry.get(router.error)).toBe(failure)
    expect(registry.get(atoms.localeAtom)).toBe("es")
    expect(sideEffects).toEqual([])

    registry.set(atoms.useDeviceLocaleAtom, undefined)
    const deviceResult = registry.get(atoms.useDeviceLocaleAtom)
    expect(AsyncResult.isFailure(deviceResult)).toBe(true)
    if (AsyncResult.isFailure(deviceResult)) {
      expect(Option.getOrThrow(Cause.findErrorOption(deviceResult.cause))).toBe(failure)
    }
    expect(registry.get(atoms.localeAtom)).toBe("es")
    expect(sideEffects).toEqual([])
  })
})
