import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { RegistrationPathNavigation } from "./atoms.js"
import type { RegistrationPath } from "./model.js"

export const makeMemoryRegistrationPathNavigation = (
  initialPath: RegistrationPath = [],
): RegistrationPathNavigation<never> => {
  const registrationPathAtom = Atom.make<RegistrationPath>(initialPath)
  return {
    registrationPathAtom,
    replaceRegistrationPath: (path, get) => Effect.sync(() => {
      get.set(registrationPathAtom, path)
    }),
  }
}
