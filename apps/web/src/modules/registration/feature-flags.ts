import {
  makeFeatureFlagSnapshotModule,
  makeRegistrationLandingAtoms,
} from "@proxus/frontend-core/feature-flags"
import {
  FeatureFlagInstallationIdentityWebLive,
  makeFeatureFlagDistributionWebLive,
  registrationLandingAnalyticsWebLayer,
} from "../../platform/feature-flags/index.js"
import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

const snapshot = makeFeatureFlagDistributionWebLive("/api").pipe(
  Atom.runtime,
  makeFeatureFlagSnapshotModule,
)
const landing = makeRegistrationLandingAtoms({
  snapshotAtom: snapshot.snapshotAtom,
  layer: Layer.merge(
    FeatureFlagInstallationIdentityWebLive,
    registrationLandingAnalyticsWebLayer("/api"),
  ),
})

export const featureFlagSnapshotQuery = snapshot.snapshotAtom
export const featureFlagSnapshotLifecycleAtom = snapshot.lifecycleAtom
export const registrationLandingAssignmentAtom = landing.assignmentAtom
export const registrationLandingExposureLifecycleAtom = landing.exposureLifecycleAtom
export const registrationStartedAnalyticsAction = landing.registrationStartedAtom
export const registrationCompletedAnalyticsAction = landing.registrationCompletedAtom
