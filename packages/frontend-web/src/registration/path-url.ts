import type { RetryableCommandRunner } from "@proxus/frontend-core/navigation"
import {
  RegistrationPathParam,
  type RegistrationPath,
  type RegistrationPathNavigation,
} from "@proxus/frontend-core/registration"
import type {
  RouteDestination,
  RouterCommandError,
  RouterLocation,
  RouterService,
} from "@proxus/frontend-core/routing"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

export interface WebRegistrationPathNavigation<Destination extends RouteDestination>
  extends RegistrationPathNavigation<RouterCommandError> {
  readonly canonicalizeRegistrationPathAtom: Atom.AtomResultFn<RouterLocation<Destination>, void, RouterCommandError>
  readonly registrationPathLifecycleAtom: Atom.Atom<unknown>
}

/** Projects registration query state through the router, the sole History owner. */
export const makeWebRegistrationPathNavigation = <Destination extends RouteDestination>(
  router: RouterService<Destination>,
  runner: RetryableCommandRunner,
  parameterName = "path",
): WebRegistrationPathNavigation<Destination> => {
  const registrationPathAtom = Atom.make<RegistrationPath>((get) => {
    const value = new URLSearchParams(get(router.location).search).get(parameterName)
    if (value === null) return []
    return Option.getOrElse(
      Schema.decodeUnknownOption(RegistrationPathParam)(value),
      () => [],
    )
  })

  const replaceRegistrationPath = Effect.fn("WebRegistrationPath.replace")(function*(
    path: RegistrationPath,
    get: Atom.FnContext,
  ) {
    const location = get(router.location)
    const search = new URLSearchParams(location.search)
    if (path.length === 0) search.delete(parameterName)
    else search.set(parameterName, yield* Schema.encodeEffect(RegistrationPathParam)(path))
    yield* router.replaceDestination(location.destination, { search: search.toString() })
  })

  const canonicalizeRegistrationPath = Effect.fn("WebRegistrationPath.canonicalize")(function*(
    location: RouterLocation<Destination>,
  ) {
    const search = new URLSearchParams(location.search)
    const value = search.get(parameterName)
    if (value === null || Option.isSome(Schema.decodeUnknownOption(RegistrationPathParam)(value))) return

    search.delete(parameterName)
    yield* router.replaceDestination(location.destination, { search: search.toString() })
  })
  const canonicalizeRegistrationPathAtom = Atom.fn<RouterLocation<Destination>>()((location, get) =>
    runner.run(get, canonicalizeRegistrationPath(location)))
  const lifecycleRuntime = Atom.runtime(Layer.empty)
  const registrationPathLifecycleAtom = lifecycleRuntime.atom(Effect.gen(function*() {
    const registry = yield* AtomRegistry.AtomRegistry
    return yield* AtomRegistry.toStream(registry, router.location).pipe(
      Stream.switchMap((location) => Stream.fromEffect(Effect.gen(function*() {
        registry.set(canonicalizeRegistrationPathAtom, location)
        yield* AtomRegistry.getResult(
          registry,
          canonicalizeRegistrationPathAtom,
          { suspendOnWaiting: true },
        ).pipe(Effect.ignore)
      }))),
      Stream.runDrain,
    )
  })).pipe(Atom.setIdleTTL(0))

  return {
    registrationPathAtom,
    replaceRegistrationPath,
    canonicalizeRegistrationPathAtom,
    registrationPathLifecycleAtom,
  }
}
