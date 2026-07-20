import { makeFeatureFlagSubjectId, type FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Cause, Deferred, Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { FeatureFlagInstallationIdentity } from "./installation-identity.js"
import {
  makeRegistrationLandingAtoms,
  type RegistrationLandingAssignment,
  RegistrationLandingAnalytics,
} from "./registration-landing.js"

const subject = makeFeatureFlagSubjectId("00000000-0000-4000-8000-000000000002")
const snapshot = (revision: number, variant: "short" | "long"): FeatureFlagSnapshot => ({
  configurationRevision: revision,
  flags: [{ key: "registration.landing", enabled: true, allocationVersion: revision, default: variant, variants: [{ value: variant, weight: 10_000 }] }],
})

describe("registration landing atoms", () => {
  it("keeps milestone coordinates at the last assignment exposed before loading and revision changes", () => Effect.runPromise(Effect.gen(function*() {
    const events: Array<{
      readonly assignment: RegistrationLandingAssignment
      readonly tag: "feature_flag_exposed" | "registration_started" | "registration_completed"
    }> = []
    const exposed = yield* Deferred.make<void>()
    const milestones = yield* Deferred.make<void>()
    const layer = Layer.mergeAll(
      Layer.succeed(FeatureFlagInstallationIdentity, FeatureFlagInstallationIdentity.of({ getOrCreate: () => Effect.succeed(subject) })),
      Layer.succeed(RegistrationLandingAnalytics, RegistrationLandingAnalytics.of({
        record: (assignment, tag) => Effect.sync(() => {
          events.push({ assignment, tag })
          if (tag === "feature_flag_exposed") Deferred.doneUnsafe(exposed, Effect.void)
          if (events.length === 3) Deferred.doneUnsafe(milestones, Effect.void)
        }),
      })),
    )
    const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot, Error>>(AsyncResult.initial(true))
    const atoms = makeRegistrationLandingAtoms({ snapshotAtom, layer })
    const registry = AtomRegistry.make()
    const unmountExposure = registry.mount(atoms.exposureLifecycleAtom)

    registry.set(snapshotAtom, AsyncResult.success(snapshot(1, "long")))
    yield* Deferred.await(exposed)
    unmountExposure()

    registry.set(snapshotAtom, AsyncResult.success(snapshot(1, "long"), { waiting: true }))
    expect(registry.get(atoms.assignmentAtom)).toMatchObject({
      _tag: "Success", waiting: true, value: { revision: 1 },
    })
    registry.set(snapshotAtom, AsyncResult.failure(Cause.fail(new Error("offline"))))
    expect(registry.get(atoms.assignmentAtom)).toMatchObject({ _tag: "Failure" })
    registry.set(snapshotAtom, AsyncResult.success(snapshot(2, "short")))
    expect(registry.get(atoms.assignmentAtom)).toMatchObject({
      _tag: "Success", value: { variant: "short", revision: 2 },
    })

    registry.set(atoms.registrationStartedAtom, undefined)
    yield* AtomRegistry.getResult(registry, atoms.registrationStartedAtom, { suspendOnWaiting: true })
    registry.set(atoms.registrationCompletedAtom, undefined)
    yield* AtomRegistry.getResult(registry, atoms.registrationCompletedAtom, { suspendOnWaiting: true })
    yield* Deferred.await(milestones)
    expect(events.map(({ assignment, tag }) => ({ revision: assignment.revision, variant: assignment.variant, tag }))).toEqual([
      { revision: 1, variant: "long", tag: "feature_flag_exposed" },
      { revision: 1, variant: "long", tag: "registration_started" },
      { revision: 1, variant: "long", tag: "registration_completed" },
    ])
  })))

  it("attributes started to revision two while revision one exposure analytics is still blocked", () => Effect.runPromise(Effect.gen(function*() {
    const revisionOneExposureStarted = yield* Deferred.make<void>()
    const releaseRevisionOneExposure = yield* Deferred.make<void>()
    const revisionTwoExposureStarted = yield* Deferred.make<void>()
    const startedAssignment = yield* Deferred.make<RegistrationLandingAssignment>()
    const layer = Layer.mergeAll(
      Layer.succeed(FeatureFlagInstallationIdentity, FeatureFlagInstallationIdentity.of({ getOrCreate: () => Effect.succeed(subject) })),
      Layer.succeed(RegistrationLandingAnalytics, RegistrationLandingAnalytics.of({
        record: (assignment, tag) => Effect.gen(function*() {
          if (tag === "feature_flag_exposed" && assignment.revision === 1) {
            yield* Deferred.succeed(revisionOneExposureStarted, undefined)
            yield* Deferred.await(releaseRevisionOneExposure)
          } else if (tag === "feature_flag_exposed" && assignment.revision === 2) {
            yield* Deferred.succeed(revisionTwoExposureStarted, undefined)
          } else if (tag === "registration_started") {
            yield* Deferred.succeed(startedAssignment, assignment)
          }
        }),
      })),
    )
    const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot, Error>>(AsyncResult.initial(true))
    const atoms = makeRegistrationLandingAtoms({ snapshotAtom, layer })
    const registry = AtomRegistry.make()
    const unmountExposure = registry.mount(atoms.exposureLifecycleAtom)

    registry.set(snapshotAtom, AsyncResult.success(snapshot(1, "long")))
    yield* Deferred.await(revisionOneExposureStarted)
    registry.set(snapshotAtom, AsyncResult.success(snapshot(2, "short")))
    yield* Deferred.await(revisionTwoExposureStarted)
    expect(yield* Deferred.isDone(releaseRevisionOneExposure)).toBe(false)

    registry.set(atoms.registrationStartedAtom, undefined)
    yield* AtomRegistry.getResult(registry, atoms.registrationStartedAtom, { suspendOnWaiting: true })
    expect(yield* Deferred.await(startedAssignment)).toMatchObject({
      revision: 2,
      variant: "short",
    })

    yield* Deferred.succeed(releaseRevisionOneExposure, undefined)
    unmountExposure()
  })))

  it("records exposure once per revision and subject across a StrictMode-style remount", () => Effect.runPromise(Effect.gen(function*() {
    const exposures: Array<number> = []
    const firstExposure = yield* Deferred.make<void>()
    const secondExposure = yield* Deferred.make<void>()
    const layer = Layer.mergeAll(
      Layer.succeed(FeatureFlagInstallationIdentity, FeatureFlagInstallationIdentity.of({ getOrCreate: () => Effect.succeed(subject) })),
      Layer.succeed(RegistrationLandingAnalytics, RegistrationLandingAnalytics.of({
        record: (assignment, tag) => Effect.sync(() => {
          if (tag !== "feature_flag_exposed") return
          exposures.push(assignment.revision)
          if (exposures.length === 1) Deferred.doneUnsafe(firstExposure, Effect.void)
          if (exposures.length === 2) Deferred.doneUnsafe(secondExposure, Effect.void)
        }),
      })),
    )
    const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot, Error>>(AsyncResult.initial(true))
    const atoms = makeRegistrationLandingAtoms({ snapshotAtom, layer })
    const registry = AtomRegistry.make()

    const firstUnmount = registry.mount(atoms.exposureLifecycleAtom)
    registry.set(snapshotAtom, AsyncResult.success(snapshot(1, "long")))
    yield* Deferred.await(firstExposure)
    firstUnmount()

    const secondUnmount = registry.mount(atoms.exposureLifecycleAtom)
    registry.set(snapshotAtom, AsyncResult.success(snapshot(2, "short")))
    yield* Deferred.await(secondExposure)
    expect(exposures).toEqual([1, 2])
    secondUnmount()
  })))

  it("does not emit milestones when no assignment was ever exposed", () => Effect.runPromise(Effect.gen(function*() {
    const events: Array<string> = []
    const layer = Layer.mergeAll(
      Layer.succeed(FeatureFlagInstallationIdentity, FeatureFlagInstallationIdentity.of({ getOrCreate: () => Effect.succeed(subject) })),
      Layer.succeed(RegistrationLandingAnalytics, RegistrationLandingAnalytics.of({
        record: (_assignment, tag) => Effect.sync(() => { events.push(tag) }),
      })),
    )
    const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot>>(AsyncResult.success(snapshot(3, "long")))
    const atoms = makeRegistrationLandingAtoms({ snapshotAtom, layer })
    const registry = AtomRegistry.make()

    registry.set(atoms.registrationStartedAtom, undefined)
    yield* AtomRegistry.getResult(registry, atoms.registrationStartedAtom, { suspendOnWaiting: true })
    registry.set(atoms.registrationCompletedAtom, undefined)
    yield* AtomRegistry.getResult(registry, atoms.registrationCompletedAtom, { suspendOnWaiting: true })

    expect(events).toEqual([])
  })))
})
