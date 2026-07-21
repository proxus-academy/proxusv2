import { RegistrationLanding, type FeatureFlagSnapshot, type FeatureFlagSubjectId, type RegistrationLandingVariant } from "@proxus/shared/feature-flags"
import type { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import { Context, Effect, Layer, Stream } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { evaluateSnapshotFeatureFlag } from "./atoms.js"
import { FeatureFlagInstallationIdentity } from "./installation-identity.js"

export interface RegistrationLandingAssignment {
  readonly flagKey: "registration.landing"
  readonly variant: RegistrationLandingVariant
  readonly revision: number
  readonly subject: FeatureFlagSubjectId
}

/** Capability seam for consent-aware, best-effort public product analytics. */
export class RegistrationLandingAnalytics extends Context.Service<RegistrationLandingAnalytics, {
  readonly record: (
    assignment: RegistrationLandingAssignment,
    tag: PublicProductAnalyticsEvent["_tag"],
  ) => Effect.Effect<void>
}>()("@proxus/frontend-core/feature-flags/registration-landing/RegistrationLandingAnalytics") {}

export const makeRegistrationLandingAtoms = <E>(options: {
  readonly snapshotAtom: Atom.Atom<AsyncResult.AsyncResult<FeatureFlagSnapshot, E>>
  readonly layer: Layer.Layer<FeatureFlagInstallationIdentity | RegistrationLandingAnalytics>
}) => {
  const runtime = Atom.runtime(options.layer)
  const subjectAtom = runtime.atom(FeatureFlagInstallationIdentity.use((identity) => identity.getOrCreate()))
  const assignmentAtom = Atom.make((get) => AsyncResult.map(
    AsyncResult.all({ snapshot: get(options.snapshotAtom), subject: get(subjectAtom) }),
    ({ snapshot, subject }): RegistrationLandingAssignment => ({
      flagKey: "registration.landing",
      variant: evaluateSnapshotFeatureFlag(RegistrationLanding, snapshot, subject).value,
      revision: snapshot.configurationRevision,
      subject,
    }),
  ))

  const recordRegistrationLandingEventAtom = runtime.fn(
    ({ assignment, tag }: { readonly assignment: RegistrationLandingAssignment; readonly tag: PublicProductAnalyticsEvent["_tag"] }) =>
      RegistrationLandingAnalytics.use((analytics) => analytics.record(assignment, tag)),
  )
  const exposedAssignmentsAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive)
  const lastExposedAssignmentAtom = Atom.make<RegistrationLandingAssignment | undefined>(undefined).pipe(Atom.keepAlive)
  const exposureLifecycleAtom = runtime.atom(Effect.gen(function*() {
    const registry = yield* AtomRegistry.AtomRegistry
    return yield* AtomRegistry.toStream(registry, assignmentAtom).pipe(
      Stream.filter(AsyncResult.isSuccess),
      Stream.mapEffect((result) => Effect.suspend(() => {
        const assignment = result.value
        const key = `${assignment.subject}:${assignment.revision}`
        const exposed = registry.get(exposedAssignmentsAtom)
        if (exposed.has(key)) return Effect.void

        registry.set(exposedAssignmentsAtom, new Set([...exposed, key]))
        registry.set(lastExposedAssignmentAtom, assignment)
        registry.set(recordRegistrationLandingEventAtom, {
          assignment,
          tag: "feature_flag_exposed",
        })
        return Effect.void
      })),
      Stream.runDrain,
    )
  })).pipe(Atom.setIdleTTL(0))
  const registrationStartedAtom = runtime.fn((_input: void, get) => {
    const assignment = get(lastExposedAssignmentAtom)
    return assignment === undefined
      ? Effect.void
      : get.setResult(recordRegistrationLandingEventAtom, { assignment, tag: "registration_started" })
  })
  const registrationCompletedAtom = runtime.fn((_input: void, get) => {
    const assignment = get(lastExposedAssignmentAtom)
    return assignment === undefined
      ? Effect.void
      : get.setResult(recordRegistrationLandingEventAtom, { assignment, tag: "registration_completed" })
  })

  return {
    assignmentAtom,
    exposureLifecycleAtom,
    registrationStartedAtom,
    registrationCompletedAtom,
  }
}
