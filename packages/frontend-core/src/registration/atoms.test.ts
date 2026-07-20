import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  SubjectNode,
  UniversityNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
} from "@proxus/shared/study-catalog"
import { Cause, DateTime, Effect, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeRetryableCommands } from "../navigation/index.js"
import { makeRegistrationAtoms } from "./atoms.js"
import type { RegistrationPath } from "./model.js"
import { makeMemoryRegistrationPathNavigation } from "./testing.js"
import { appendRegistrationNode } from "./transitions.js"

const now = DateTime.makeUnsafe(0)
const country = new CountryNode({
  id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
  kind: "country",
  name: "España",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const studyType = new StudyTypeNode({
  id: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"),
  kind: "type",
  name: "Estudios universitarios",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const university = new UniversityNode({
  id: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"),
  kind: "university",
  name: "UCM",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const degree = new DegreeNode({
  id: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"),
  kind: "degree",
  name: "Informática",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const subject = new SubjectNode({
  id: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"),
  kind: "subject",
  name: "Álgebra",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})

describe("registration graph path", () => {
  it("selects valid consecutive nodes and supports back and reset", () => {
    const registry = AtomRegistry.make()
    const {
      goBackRegistrationAtom,
      registrationPathAtom,
      resetRegistrationAtom,
      selectRegistrationNodeAtom,
    } = makeRegistrationAtoms(
      makeMemoryRegistrationPathNavigation(),
      makeRetryableCommands(),
    )

    registry.set(selectRegistrationNodeAtom, country)
    registry.set(selectRegistrationNodeAtom, studyType)
    expect(registry.get(registrationPathAtom)).toEqual([country, studyType])

    registry.set(goBackRegistrationAtom, undefined)
    expect(registry.get(registrationPathAtom)).toEqual([country])

    registry.set(resetRegistrationAtom, undefined)
    expect(registry.get(registrationPathAtom)).toEqual([])
  })

  it("rejects nodes that do not match the current level", () => {
    const registry = AtomRegistry.make()
    const { registrationPathAtom, selectRegistrationNodeAtom } =
      makeRegistrationAtoms(
        makeMemoryRegistrationPathNavigation(),
        makeRetryableCommands(),
      )

    registry.set(selectRegistrationNodeAtom, studyType)

    expect(registry.get(registrationPathAtom)).toEqual([])
  })

  it("runs milestones only after the replacement publishes the next path", () => {
    const events: Array<string> = []
    const registrationPathAtom = Atom.make<RegistrationPath>([])
    const atoms = makeRegistrationAtoms(
      {
        registrationPathAtom,
        replaceRegistrationPath: (path, get) => Effect.sync(() => {
          events.push("replace")
          get.set(registrationPathAtom, path)
        }),
      },
      makeRetryableCommands(),
      {
        registrationStarted: () => Effect.sync(() => { events.push("registration_started") }),
        registrationCompleted: () => Effect.sync(() => { events.push("registration_completed") }),
      },
    )
    const registry = AtomRegistry.make()

    registry.set(atoms.selectRegistrationNodeAtom, country)

    expect(events).toEqual(["replace", "registration_started"])
    expect(registry.get(registrationPathAtom)).toEqual([country])
  })

  const assertRetriableCommand = (operation: "select" | "back" | "reset") => {
    const countryPath = appendRegistrationNode([], country)
    const initialPath: RegistrationPath = operation === "select" ? [] : countryPath
    const expectedPath: RegistrationPath = operation === "select" ? countryPath : []
    const registrationPathAtom = Atom.make<RegistrationPath>(initialPath)
    const attemptedPaths: Array<RegistrationPath> = []
    const failure = new Error(`${operation} unavailable`)
    const navigation = makeRetryableCommands()
    let shouldFail = true
    const atoms = makeRegistrationAtoms(
      {
        registrationPathAtom,
        replaceRegistrationPath: (path, get) => Effect.suspend(() => {
          attemptedPaths.push(path)
          if (shouldFail) return Effect.fail(failure)
          return Effect.sync(() => get.set(registrationPathAtom, path))
        }),
      },
      navigation,
    )
    const registry = AtomRegistry.make()

    if (operation === "select") registry.set(atoms.selectRegistrationNodeAtom, country)
    else if (operation === "back") registry.set(atoms.goBackRegistrationAtom, undefined)
    else registry.set(atoms.resetRegistrationAtom, undefined)

    expect(registry.get(navigation.failedAtom)).toBe(true)
    expect(registry.get(registrationPathAtom)).toEqual(initialPath)

    shouldFail = false
    registry.set(navigation.retryAtom, undefined)
    AsyncResult.getOrThrow(registry.get(navigation.retryAtom))

    const [firstAttempt, secondAttempt] = attemptedPaths
    expect(secondAttempt).toBe(firstAttempt)
    expect(registry.get(registrationPathAtom)).toEqual(expectedPath)
    expect(registry.get(navigation.failedAtom)).toBe(false)
  }

  it("retries the exact failed select command", () => {
    assertRetriableCommand("select")
  })

  it("retries the exact failed back command", () => {
    assertRetriableCommand("back")
  })

  it("retries the exact failed reset command", () => {
    assertRetriableCommand("reset")
  })

  it("exposes failed start and completion operations without emitting milestones", () => {
    const failure = new Error("navigation unavailable")
    const milestones: Array<string> = []
    const milestoneOperations = {
      registrationStarted: () => Effect.sync(() => { milestones.push("registration_started") }),
      registrationCompleted: () => Effect.sync(() => { milestones.push("registration_completed") }),
    }
    const assertNavigationFailure = (result: AsyncResult.AsyncResult<unknown, Error>) => {
      expect(AsyncResult.isFailure(result)).toBe(true)
      if (AsyncResult.isFailure(result)) {
        expect(Option.getOrThrow(Cause.findErrorOption(result.cause))).toBe(failure)
      }
    }
    const registry = AtomRegistry.make()
    const startPathAtom = Atom.make<RegistrationPath>([])
    const startAtoms = makeRegistrationAtoms(
      {
        registrationPathAtom: startPathAtom,
        replaceRegistrationPath: () => Effect.fail(failure),
      },
      makeRetryableCommands(),
      milestoneOperations,
    )

    registry.set(startAtoms.selectRegistrationNodeAtom, country)
    assertNavigationFailure(registry.get(startAtoms.selectRegistrationNodeAtom))
    expect(registry.get(startPathAtom)).toEqual([])

    let pathBeforeCompletion: RegistrationPath = []
    for (const node of [country, studyType, university, degree]) {
      pathBeforeCompletion = appendRegistrationNode(pathBeforeCompletion, node)
    }
    const completionPathAtom = Atom.make<RegistrationPath>(pathBeforeCompletion)
    const completionAtoms = makeRegistrationAtoms(
      {
        registrationPathAtom: completionPathAtom,
        replaceRegistrationPath: () => Effect.fail(failure),
      },
      makeRetryableCommands(),
      milestoneOperations,
    )

    registry.set(completionAtoms.selectRegistrationNodeAtom, subject)
    assertNavigationFailure(registry.get(completionAtoms.selectRegistrationNodeAtom))
    expect(registry.get(completionPathAtom)).toEqual(pathBeforeCompletion)
    expect(milestones).toEqual([])
  })
})
