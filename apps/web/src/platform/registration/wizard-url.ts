import type { RetryableCommandRunner } from "@proxus/frontend-core/navigation"
import {
  guardRegistrationStep,
  RegistrationPathParam,
  RegistrationStepParam,
  type RegistrationDraft,
  type RegistrationPath,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import type { RouteDestination, RouterCommandError, RouterLocation, RouterService } from "@proxus/frontend-core/routing"
import { Effect, Option, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export interface RegistrationUrlState {
  readonly step: RegistrationStep
  readonly path: RegistrationPath
  readonly valid: boolean
}

export const decodeRegistrationQuery = (searchValue: string): RegistrationUrlState => {
  const search = new URLSearchParams(searchValue)
  const rawStep = search.get("step")
  const rawPath = search.get("path")
  const step = rawStep === null ? "start" : Option.getOrElse(Schema.decodeUnknownOption(RegistrationStepParam)(rawStep), () => "start" as const)
  const path: RegistrationPath = rawPath === null ? [] : Option.getOrElse(Schema.decodeUnknownOption(RegistrationPathParam)(rawPath), (): RegistrationPath => [])
  return { step, path, valid: (rawStep === null || Schema.is(RegistrationStepParam)(rawStep)) && (rawPath === null || Schema.is(RegistrationPathParam)(rawPath)) }
}

const encodeQuery = (current: string, step: RegistrationStep, path: RegistrationPath) => {
  const search = new URLSearchParams(current)
  if (step === "start") search.delete("step"); else search.set("step", step)
  if (path.length === 0) search.delete("path"); else search.set("path", Schema.encodeSync(RegistrationPathParam)(path))
  return search.toString()
}

export const makeWebRegistrationWizardNavigation = <Destination extends RouteDestination>(
  router: RouterService<Destination>,
  runner: RetryableCommandRunner,
) => {
  const urlStateAtom = Atom.make((get): RegistrationUrlState => decodeRegistrationQuery(get(router.location).search))

  const navigate = (operation: "push" | "replace", step: RegistrationStep, path: RegistrationPath, get: Atom.FnContext) => {
    const location = get(router.location)
    const change = operation === "push" ? router.pushDestination : router.replaceDestination
    return change(location.destination, { search: encodeQuery(location.search, step, path) })
  }
  const push = (step: RegistrationStep, path: RegistrationPath, get: Atom.FnContext): Effect.Effect<void, RouterCommandError> => navigate("push", step, path, get)
  const replace = (step: RegistrationStep, path: RegistrationPath, get: Atom.FnContext): Effect.Effect<void, RouterCommandError> => navigate("replace", step, path, get)

  const pushAtom = Atom.fn<{ readonly step: RegistrationStep; readonly path: RegistrationPath }>()((input, get) => runner.run(get, push(input.step, input.path, get)))
  const canonicalizeAtom = Atom.fn<{ readonly location: RouterLocation<Destination>; readonly draft: RegistrationDraft }>()(({ location, draft }, get) => {
    const decoded = decodeRegistrationQuery(location.search)
    const guarded = guardRegistrationStep(decoded.step, { ...draft, path: decoded.path })
    if (decoded.valid && guarded === decoded.step) return Effect.void
    return runner.run(get, replace(guarded, decoded.path, get))
  })

  return { urlStateAtom, push, replace, pushAtom, canonicalizeAtom }
}
