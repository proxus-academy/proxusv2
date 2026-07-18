import {
  RegistrationPathParam,
  type RegistrationPath,
  type RegistrationPathAtom,
} from "@proxus/frontend-core/registration"
import type { RouteDestination, RouterService } from "@proxus/frontend-core/routing"
import { Effect, Option, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

/** Projects registration query state through the router, the sole History owner. */
export const makeWebRegistrationPathAtom = <Destination extends RouteDestination>(
  router: RouterService<Destination>,
  parameterName = "path",
): RegistrationPathAtom => Atom.writable<RegistrationPath, RegistrationPath>(
  (get) => {
    const value = new URLSearchParams(get(router.location).search).get(parameterName)
    if (value === null) return []
    return Option.getOrElse(
      Effect.runSync(Effect.option(Schema.decodeUnknownEffect(RegistrationPathParam)(value))),
      () => [],
    )
  },
  (get, path) => {
    const location = get.get(router.location)
    const search = new URLSearchParams(location.search)
    if (path.length === 0) search.delete(parameterName)
    else search.set(parameterName, Effect.runSync(Schema.encodeEffect(RegistrationPathParam)(path)))
    Effect.runFork(router.replace(location.destination, { search: search.toString() }))
  },
  (refresh) => refresh(router.location),
)
