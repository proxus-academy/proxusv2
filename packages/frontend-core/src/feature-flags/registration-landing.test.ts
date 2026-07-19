import { makeFeatureFlagSubjectId, type FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Cause, Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { FeatureFlagInstallationIdentity } from "./installation-identity.js"
import { makeRegistrationLandingAtoms, RegistrationLandingAnalytics } from "./registration-landing.js"

const subject = makeFeatureFlagSubjectId("00000000-0000-4000-8000-000000000002")
const snapshot = (revision: number, variant: "short" | "long"): FeatureFlagSnapshot => ({
  configurationRevision: revision,
  flags: [{ key: "registration.landing", enabled: true, allocationVersion: revision, default: variant, variants: [{ value: variant, weight: 10_000 }] }],
})

const wait = () => Effect.runPromise(Effect.sleep("5 millis"))

describe("registration landing atoms", () => {
  // Vitest bridge; async state is owned by the production runtime atom.
  // @effect-diagnostics-next-line asyncFunction:off
  it("derives one reactive assignment from the shared snapshot and preserves its states", async () => {
    const events: Array<string> = []
    const layer = Layer.mergeAll(
      Layer.succeed(FeatureFlagInstallationIdentity, FeatureFlagInstallationIdentity.of({ getOrCreate: () => Effect.succeed(subject) })),
      Layer.succeed(RegistrationLandingAnalytics, RegistrationLandingAnalytics.of({
        record: (_assignment, tag) => Effect.sync(() => { events.push(tag) }),
      })),
    )
    const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot, Error>>(AsyncResult.initial(true))
    const atoms = makeRegistrationLandingAtoms({ snapshotAtom, layer })
    const registry = AtomRegistry.make()
    const unmount = registry.mount(atoms.assignmentAtom)

    expect(registry.get(atoms.assignmentAtom)).toMatchObject({ _tag: "Initial" })
    registry.set(snapshotAtom, AsyncResult.success(snapshot(1, "long")))
    await wait()
    expect(registry.get(atoms.assignmentAtom)).toMatchObject({
      _tag: "Success", value: { variant: "long", revision: 1, subject },
    })
    registry.set(snapshotAtom, AsyncResult.failure(Cause.fail(new Error("offline"))))
    expect(registry.get(atoms.assignmentAtom)).toMatchObject({ _tag: "Failure" })
    registry.set(snapshotAtom, AsyncResult.success(snapshot(2, "short")))
    expect(registry.get(atoms.assignmentAtom)).toMatchObject({ _tag: "Success", value: { variant: "short", revision: 2 } })

    const assignment = AsyncResult.getOrThrow(registry.get(atoms.assignmentAtom))
    registry.set(atoms.registrationStartedAtom, assignment)
    registry.set(atoms.registrationCompletedAtom, assignment)
    await wait()
    expect(events).toEqual(["registration_started", "registration_completed"])
    unmount()
  })
})
