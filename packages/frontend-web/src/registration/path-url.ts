import {
  RegistrationPathParam,
  type RegistrationPath,
  type RegistrationPathAtom,
} from "@proxus/frontend-core/registration"
import { Option } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export const makeWebRegistrationPathAtom = (
  parameterName = "path",
): RegistrationPathAtom => {
  const parameterAtom = Atom.searchParam(parameterName, {
    schema: RegistrationPathParam,
  })

  return Atom.writable<RegistrationPath, RegistrationPath>(
    (get) => Option.getOrElse(get(parameterAtom), () => []),
    (get, path) => {
      get.set(
        parameterAtom,
        path.length === 0 ? Option.none() : Option.some(path),
      )
    },
    (refresh) => refresh(parameterAtom),
  )
}
