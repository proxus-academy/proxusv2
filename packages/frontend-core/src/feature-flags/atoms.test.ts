import { RegistrationCta, type FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeSnapshotFeatureFlagDecisionAtom } from "./atoms.js"

const validSubject = "00000000-0000-4000-8000-000000000002"
const emptySnapshot: FeatureFlagSnapshot = { configurationRevision: 0, flags: [] }

const makeDecision = <E>(snapshotAtom: Atom.Atom<AsyncResult.AsyncResult<FeatureFlagSnapshot, E>>, subjectId: string | null) =>
  makeSnapshotFeatureFlagDecisionAtom({ definition: RegistrationCta, snapshotAtom, subjectIdAtom: Atom.make(subjectId) })

describe("feature flag decision atom", () => {
  it("preserves snapshot loading, failure, and success", () => {
    const registry = AtomRegistry.make()
    const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot, string>>(AsyncResult.initial(true))
    const decisionAtom = makeDecision(snapshotAtom, validSubject)

    expect(registry.get(decisionAtom)).toMatchObject({ _tag: "Initial", waiting: true })
    registry.set(snapshotAtom, AsyncResult.failure(Cause.fail("offline")))
    expect(registry.get(decisionAtom)).toMatchObject({ _tag: "Failure" })
    registry.set(snapshotAtom, AsyncResult.success(emptySnapshot))
    expect(registry.get(decisionAtom)).toMatchObject({
      _tag: "Success",
      value: { value: "benefitCopy", source: "allocation" },
    })
  })

  it("uses a known remote snapshot and falls back safely for unknown variants", () => {
    const registry = AtomRegistry.make()
    const remote = Atom.make(AsyncResult.success<FeatureFlagSnapshot>({
      configurationRevision: 1,
      flags: [{ key: "registration.cta", allocationVersion: 2, default: "benefitCopy", variants: [{ value: "benefitCopy", weight: 10_000 }] }],
    }))
    expect(AsyncResult.getOrThrow(registry.get(makeDecision(remote, null)))).toMatchObject({ value: "benefitCopy", allocationVersion: 2 })

    registry.set(remote, AsyncResult.success({
      configurationRevision: 2,
      flags: [{ key: "registration.cta", allocationVersion: 3, default: "future", variants: [{ value: "future", weight: 10_000 }] }],
    }))
    expect(AsyncResult.getOrThrow(registry.get(makeDecision(remote, validSubject)))).toMatchObject({ value: "control", source: "default" })
  })
})
