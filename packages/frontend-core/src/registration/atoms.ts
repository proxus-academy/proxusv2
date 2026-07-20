import type { StudyNode } from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { RetryableCommandRunner } from "../navigation/index.js"
import { appendRegistrationNode, goBackRegistrationPath } from "./transitions.js"
import type { RegistrationPath } from "./model.js"

export interface RegistrationPathNavigation<E> {
  readonly registrationPathAtom: Atom.Atom<RegistrationPath>
  readonly replaceRegistrationPath: (
    path: RegistrationPath,
    get: Atom.FnContext,
  ) => Effect.Effect<void, E>
}

export interface RegistrationMilestones<E> {
  readonly registrationStarted: (get: Atom.FnContext) => Effect.Effect<void, E>
  readonly registrationCompleted: (get: Atom.FnContext) => Effect.Effect<void, E>
}

export const makeRegistrationAtoms = <E, MilestoneError = never>(
  navigation: RegistrationPathNavigation<E>,
  runner: RetryableCommandRunner,
  milestones?: RegistrationMilestones<MilestoneError>,
) => {
  const replacePath = (next: RegistrationPath, current: RegistrationPath, get: Atom.FnContext) =>
    next === current
      ? Effect.succeed(current)
      : navigation.replaceRegistrationPath(next, get).pipe(Effect.as(next))

  const selectRegistrationNodeAtom = Atom.fn<StudyNode>()((node, get) => {
    const current = get(navigation.registrationPathAtom)
    const next = appendRegistrationNode(current, node)
    const command = Effect.gen(function*() {
      yield* replacePath(next, current, get)
      if (next === current || milestones === undefined) return next
      if (current.length === 0) yield* milestones.registrationStarted(get)
      if (node.kind === "subject") yield* milestones.registrationCompleted(get)
      return next
    })
    return runner.run(get, command)
  })

  const goBackRegistrationAtom = Atom.fn((_input: void, get) => {
    const current = get(navigation.registrationPathAtom)
    return runner.run(get, replacePath(goBackRegistrationPath(current), current, get))
  })

  const resetRegistrationAtom = Atom.fn((_input: void, get) => {
    const current = get(navigation.registrationPathAtom)
    return runner.run(get, replacePath([], current, get))
  })

  return {
    registrationPathAtom: navigation.registrationPathAtom,
    selectRegistrationNodeAtom,
    goBackRegistrationAtom,
    resetRegistrationAtom,
  }
}

export type RegistrationAtoms = ReturnType<typeof makeRegistrationAtoms>
