import { makeRetryableCommands } from "@proxus/frontend-core/navigation"
import { makeRegistrationAtoms } from "@proxus/frontend-core/registration"
import {
  compile,
  makeObservableValue,
  NavigationError,
  path,
  root,
  type RouterObservableError,
  type RouterService,
} from "@proxus/frontend-core/routing"
import { CountryNode, makeCountryNodeId } from "@proxus/shared/study-catalog"
import { Cause, DateTime, Deferred, Effect, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeWebRegistrationPathNavigation } from "./path-url.js"

const country = new CountryNode({ id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"), kind: "country", name: "España", imageAssetId: null, status: "published", createdAt: DateTime.makeUnsafe(0), updatedAt: DateTime.makeUnsafe(0) })
const routes = compile(root({
  id: "root",
  children: [path({ id: "registration", path: "registration" })],
}))
const destination = routes.destination("registration")
type Destination = typeof destination

interface ReplaceFailureState {
  current: NavigationError | undefined
}

const fixture = (search = "", replaceFailure?: ReplaceFailureState) => {
  const current = makeObservableValue(destination)
  const location = makeObservableValue({ destination, search })
  const error = makeObservableValue<RouterObservableError | undefined>(undefined)
  const router: RouterService<Destination> = {
    current: current.atom,
    location: location.atom,
    error: error.atom,
    navigate: () => Effect.void,
    replace: () => Effect.void,
    pushDestination: (next, options) => Effect.sync(() => location.set({ destination: next, search: options?.search ?? location.get().search })),
    replaceDestination: (next, options) => Effect.suspend(() => {
      const failure = replaceFailure?.current
      if (failure === undefined) {
        return Effect.sync(() => location.set({ destination: next, search: options?.search ?? location.get().search }))
      }
      return Effect.fail(failure).pipe(
        Effect.tapError((cause) => Effect.sync(() => error.set(cause))),
      )
    }),
    back: Effect.void,
    forward: Effect.void,
  }
  const analytics: Array<string> = []
  const commands = makeRetryableCommands()
  const navigation = makeWebRegistrationPathNavigation(router, commands)
  return {
    atoms: makeRegistrationAtoms(
      navigation,
      commands,
      {
        registrationStarted: () => Effect.sync(() => { analytics.push("registration_started") }),
        registrationCompleted: () => Effect.sync(() => { analytics.push("registration_completed") }),
      },
    ),
    analytics,
    commands,
    error,
    location,
    navigation,
  }
}

describe("router registration query projection", () => {
  it("reads, writes, and clears through named router operations", () => {
    const { atoms, location } = fixture()
    const registry = AtomRegistry.make()
    registry.mount(atoms.registrationPathAtom)
    registry.set(atoms.selectRegistrationNodeAtom, country)
    expect(new URLSearchParams(location.get().search).has("path")).toBe(true)
    expect(registry.get(atoms.registrationPathAtom)).toEqual([country])
    registry.set(atoms.resetRegistrationAtom, undefined)
    expect(location.get().search).toBe("")
  })

  it("keeps unrelated query values", () => {
    const { atoms, location } = fixture("campaign=summer")
    AtomRegistry.make().set(atoms.selectRegistrationNodeAtom, country)
    expect(new URLSearchParams(location.get().search).get("campaign")).toBe("summer")
  })

  it("canonicalizes an invalid startup path and later invalid history projections", () => Effect.runPromise(Effect.gen(function*() {
    const firstCanonicalReplace = yield* Deferred.make<void>()
    const secondCanonicalReplace = yield* Deferred.make<void>()
    const { location, navigation } = fixture("campaign=summer&path=not-json")
    const registry = AtomRegistry.make()
    let replacements = 0
    const unsubscribe = registry.subscribe(location.atom, (current) => {
      const search = new URLSearchParams(current.search)
      if (search.has("path")) return
      replacements++
      if (replacements === 1) Deferred.doneUnsafe(firstCanonicalReplace, Effect.void)
      if (replacements === 2) Deferred.doneUnsafe(secondCanonicalReplace, Effect.void)
    })
    const unmount = registry.mount(navigation.registrationPathLifecycleAtom)

    yield* Deferred.await(firstCanonicalReplace)
    expect(location.get().search).toBe("campaign=summer")
    expect(registry.get(navigation.registrationPathAtom)).toEqual([])

    location.set({ destination, search: "campaign=history&path=%5B%7B%22kind%22%3A%22subject%22%7D%5D" })
    yield* Deferred.await(secondCanonicalReplace)
    expect(location.get().search).toBe("campaign=history")
    expect(registry.get(navigation.registrationPathAtom)).toEqual([])

    unmount()
    location.set({ destination, search: "campaign=after-unmount&path=not-json" })
    expect(location.get().search).toBe("campaign=after-unmount&path=not-json")
    unsubscribe()
  })))

  it("interrupts a stale canonicalization when a newer history location arrives", () => Effect.runPromise(Effect.gen(function*() {
    const current = makeObservableValue(destination)
    const location = makeObservableValue({ destination, search: "campaign=first&path=not-json" })
    const error = makeObservableValue<RouterObservableError | undefined>(undefined)
    const firstReplaceStarted = yield* Deferred.make<void>()
    const firstReplaceInterrupted = yield* Deferred.make<void>()
    const latestCanonicalized = yield* Deferred.make<void>()
    const neverCompleteFirstReplace = yield* Deferred.make<void>()
    let replaceAttempts = 0
    const router: RouterService<Destination> = {
      current: current.atom,
      location: location.atom,
      error: error.atom,
      navigate: () => Effect.void,
      replace: () => Effect.void,
      pushDestination: () => Effect.void,
      replaceDestination: (next, options) => Effect.gen(function*() {
        replaceAttempts++
        if (replaceAttempts === 1) {
          Deferred.doneUnsafe(firstReplaceStarted, Effect.void)
          yield* Deferred.await(neverCompleteFirstReplace).pipe(
            Effect.onInterrupt(() => Deferred.succeed(firstReplaceInterrupted, undefined)),
          )
        }
        const search = options?.search ?? location.get().search
        location.set({ destination: next, search })
        if (search === "campaign=latest") Deferred.doneUnsafe(latestCanonicalized, Effect.void)
      }),
      back: Effect.void,
      forward: Effect.void,
    }
    const navigation = makeWebRegistrationPathNavigation(router, makeRetryableCommands())
    const registry = AtomRegistry.make()
    const unmount = registry.mount(navigation.registrationPathLifecycleAtom)

    yield* Deferred.await(firstReplaceStarted)
    location.set({ destination, search: "campaign=latest&path=still-not-json" })
    yield* Deferred.await(firstReplaceInterrupted)
    yield* Deferred.await(latestCanonicalized)

    expect(location.get().search).toBe("campaign=latest")
    expect(replaceAttempts).toBe(2)
    unmount()
  })))

  it("retries the exact failed canonical-path command", () => {
    const failure = new NavigationError({ operation: "replace", message: "history blocked" })
    const replaceFailure: ReplaceFailureState = { current: failure }
    const { commands, error, location, navigation } = fixture(
      "campaign=summer&path=not-json",
      replaceFailure,
    )
    const registry = AtomRegistry.make()
    const failedLocation = location.get()

    registry.set(navigation.canonicalizeRegistrationPathAtom, failedLocation)
    const result = registry.get(navigation.canonicalizeRegistrationPathAtom)
    expect(AsyncResult.isFailure(result)).toBe(true)
    expect(registry.get(commands.failedAtom)).toBe(true)
    expect(error.get()).toBe(failure)
    expect(location.get().search).toBe("campaign=summer&path=not-json")

    location.set({ destination, search: "campaign=newer&path=also-invalid" })
    replaceFailure.current = undefined
    registry.set(commands.retryAtom, undefined)
    AsyncResult.getOrThrow(registry.get(commands.retryAtom))

    expect(location.get().search).toBe("campaign=summer")
    expect(registry.get(commands.failedAtom)).toBe(false)
  })

  it("keeps a failed replace observable without publishing the next path", () => {
    const failure = new NavigationError({ operation: "replace", message: "history blocked" })
    const { analytics, atoms, error, location } = fixture(
      "campaign=summer",
      { current: failure },
    )
    const registry = AtomRegistry.make()

    registry.set(atoms.selectRegistrationNodeAtom, country)
    const result = registry.get(atoms.selectRegistrationNodeAtom)
    expect(AsyncResult.isFailure(result)).toBe(true)
    if (AsyncResult.isFailure(result)) {
      expect(Option.getOrThrow(Cause.findErrorOption(result.cause))).toBe(failure)
    }
    expect(error.get()).toBe(failure)
    expect(analytics).toEqual([])
    expect(location.get().search).toBe("campaign=summer")
    expect(registry.get(atoms.registrationPathAtom)).toEqual([])
  })
})
