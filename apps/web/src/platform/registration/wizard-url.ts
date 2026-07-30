import {
  RegistrationPathParam,
  RegistrationStepParam,
  type RegistrationPath,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import type { RouterNavigationError } from "@proxus/effect-router"
import { Effect, Option, Schema } from "effect"
import { router } from "../../routes/router.js"

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

export const registrationUrlState = (): RegistrationUrlState =>
  decodeRegistrationQuery(router.location().search)

export const changeRegistrationStep = (
  operation: "push" | "replace",
  step: RegistrationStep,
  path: RegistrationPath,
): Effect.Effect<void, RouterNavigationError> => {
  const search = encodeQuery(router.location().search, step, path)
  return operation === "replace"
    ? router.replaceSearch(search)
    : router.pushSearch(search)
}
