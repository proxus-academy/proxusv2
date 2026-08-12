import {
  RegistrationPathParam,
  RegistrationStepParam,
  type RegistrationPath,
  type RegistrationPathParam as RegistrationNodeIds,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import { Option, Schema } from "effect"

export interface RegistrationUrlState {
  readonly step: RegistrationStep
  readonly nodeIds: RegistrationNodeIds
  readonly valid: boolean
}

export const decodeRegistrationQuery = (searchValue: string): RegistrationUrlState => {
  const search = new URLSearchParams(searchValue)
  const rawStep = search.get("step")
  const rawPath = search.get("path")
  const decodedStep = rawStep === null ? Option.some("start" as const) : Schema.decodeUnknownOption(RegistrationStepParam)(rawStep)
  const decodedPath = rawPath === null ? Option.some([] as RegistrationNodeIds) : Schema.decodeUnknownOption(RegistrationPathParam)(rawPath)
  const step = Option.getOrElse(decodedStep, () => "start" as const)
  const nodeIds = Option.getOrElse(decodedPath, (): RegistrationNodeIds => [])
  return { step, nodeIds, valid: Option.isSome(decodedStep) && Option.isSome(decodedPath) }
}

export const encodeRegistrationQuery = (current: string, step: RegistrationStep, path: RegistrationPath) => {
  const search = new URLSearchParams(current)
  if (step === "start") search.delete("step"); else search.set("step", step)
  const nodeIds = path.map(({ id }) => id)
  if (nodeIds.length === 0) search.delete("path"); else search.set("path", Schema.encodeSync(RegistrationPathParam)(nodeIds))
  return search.toString()
}

