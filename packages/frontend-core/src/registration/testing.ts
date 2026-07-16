import * as Atom from "effect/unstable/reactivity/Atom"
import type { RegistrationPathAtom } from "./atoms.js"
import type { RegistrationPath } from "./model.js"

export const makeMemoryRegistrationPathAtom = (
  initialPath: RegistrationPath = [],
): RegistrationPathAtom => Atom.make<RegistrationPath>(initialPath)
