import type { StudyNode } from "@proxus/shared/study-catalog"
import * as Atom from "effect/unstable/reactivity/Atom"
import { appendRegistrationNode, goBackRegistrationPath } from "./transitions.js"
import type { RegistrationPath } from "./model.js"

export type RegistrationPathAtom = Atom.Writable<
  RegistrationPath,
  RegistrationPath
>

export const makeRegistrationAtoms = (
  registrationPathAtom: RegistrationPathAtom,
) => {
  const selectRegistrationNodeAtom = Atom.fnSync<StudyNode>()((node, get) => {
    const path = get(registrationPathAtom)
    const next = appendRegistrationNode(path, node)
    if (next !== path) get.set(registrationPathAtom, next)
  })

  const goBackRegistrationAtom = Atom.fnSync((_input: void, get) => {
    get.set(
      registrationPathAtom,
      goBackRegistrationPath(get(registrationPathAtom)),
    )
  })

  const resetRegistrationAtom = Atom.fnSync((_input: void, get) => {
    get.set(registrationPathAtom, [])
  })

  return {
    registrationPathAtom,
    selectRegistrationNodeAtom,
    goBackRegistrationAtom,
    resetRegistrationAtom,
  } as const
}

export type RegistrationAtoms = ReturnType<typeof makeRegistrationAtoms>
