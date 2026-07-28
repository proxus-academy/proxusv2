import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { navigation, router } from "../../routes/router.js"

export const authenticatedRouteLifecycleAtom = Atom.make((get) => {
  const session = get(currentSessionQuery)
  return session._tag === "Success" && session.value === null
    ? navigation.run(get, router.replace("login"))
    : Effect.void
})

export const publicOnlyRouteLifecycleAtom = Atom.make((get) => {
  const session = get(currentSessionQuery)
  return session._tag === "Success" && session.value !== null
    ? navigation.run(get, router.replace("home"))
    : Effect.void
})
