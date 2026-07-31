import {
  RegistrationPathParam,
  RegistrationStepParam,
  type RegistrationPath,
  type RegistrationPathParam as RegistrationNodeIds,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import { Effect, Option, Schema } from "effect"
import {
  currentSearch,
  setSearch,
  type WebNavigationError,
} from "../../routes/navigation.js"

export interface RegistrationUrlState {
  readonly step: RegistrationStep
  readonly nodeIds: RegistrationNodeIds
  readonly valid: boolean
}

export const decodeRegistrationQuery = (searchValue: string): RegistrationUrlState => {
  const search = new URLSearchParams(searchValue)
  const rawStep = search.get("step")
  const rawPath = search.get("path")
  const step = rawStep === null ? "start" : Option.getOrElse(Schema.decodeUnknownOption(RegistrationStepParam)(rawStep), () => "start" as const)
  const nodeIds: RegistrationNodeIds = rawPath === null ? [] : Option.getOrElse(Schema.decodeUnknownOption(RegistrationPathParam)(rawPath), (): RegistrationNodeIds => [])
  return { step, nodeIds, valid: (rawStep === null || Schema.is(RegistrationStepParam)(rawStep)) && (rawPath === null || Schema.is(RegistrationPathParam)(rawPath)) }
}

const encodeQuery = (current: string, step: RegistrationStep, path: RegistrationPath) => {
  const search = new URLSearchParams(current)
  if (step === "start") search.delete("step"); else search.set("step", step)
  const nodeIds = path.map(({ id }) => id)
  if (nodeIds.length === 0) search.delete("path"); else search.set("path", Schema.encodeSync(RegistrationPathParam)(nodeIds))
  return search.toString()
}

export const registrationUrlState = (): RegistrationUrlState =>
  decodeRegistrationQuery(currentSearch().toString())

export const changeRegistrationStep = (
  operation: "push" | "replace",
  step: RegistrationStep,
  path: RegistrationPath,
): Effect.Effect<void, WebNavigationError> =>
  setSearch(operation, new URLSearchParams(
    encodeQuery(currentSearch().toString(), step, path),
  ))
