import { RegistrationLanding, type FeatureFlagSnapshot, type FeatureFlagSubjectId, type RegistrationLandingVariant } from "@proxus/shared/feature-flags"
import type { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import { Context, Effect, Layer } from "effect"
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
  const exposeRegistrationLandingAtom = Atom.fnSync<RegistrationLandingAssignment>()((assignment, get) => {
    get.set(recordRegistrationLandingEventAtom, { assignment, tag: "feature_flag_exposed" })
  })
  const exposureLifecycleEffectAtom = runtime.atom(Effect.gen(function*() {
    const registry = yield* AtomRegistry.AtomRegistry
    return yield* Effect.acquireRelease(
      Effect.sync(() => registry.subscribe(assignmentAtom, (result) => {
        if (AsyncResult.isSuccess(result)) registry.set(exposeRegistrationLandingAtom, result.value)
      }, { immediate: true })),
      (unsubscribe) => Effect.sync(unsubscribe),
    ).pipe(Effect.andThen(Effect.never))
  }))
  const exposureLifecycleAtom = Atom.make((get) => {
    get.mount(assignmentAtom)
    return get(exposureLifecycleEffectAtom)
  })
  const registrationStartedAtom = Atom.fnSync<RegistrationLandingAssignment>()((assignment, get) => {
    get.set(recordRegistrationLandingEventAtom, { assignment, tag: "registration_started" })
  })
  const registrationCompletedAtom = Atom.fnSync<RegistrationLandingAssignment>()((assignment, get) => {
    get.set(recordRegistrationLandingEventAtom, { assignment, tag: "registration_completed" })
  })

  return {
    assignmentAtom,
    exposureLifecycleAtom,
    exposeRegistrationLandingAtom,
    registrationStartedAtom,
    registrationCompletedAtom,
  } as const
}
