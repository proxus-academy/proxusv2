import type { RetryableCommandRunner } from "@proxus/frontend-core/navigation"
import type { RouteDestination, RouterService } from "@proxus/frontend-core/routing"
import { Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export const AuthStepParam = Schema.Literals(["login", "forgot", "pending", "code", "new-password", "done"])
export type AuthStep = typeof AuthStepParam.Type

export const makeWebAuthNavigation = <D extends RouteDestination>(router: RouterService<D>, runner: RetryableCommandRunner) => {
  const pushAtom = Atom.fn<AuthStep>()((step, get) => {
    const location = get(router.location)
    const search = new URLSearchParams(location.search)
    search.set("step", step)
    return runner.run(get, router.pushDestination(location.destination, { search: search.toString() }))
  })
  return { pushAtom }
}
