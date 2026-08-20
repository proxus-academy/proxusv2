import {
  makeFeatureFlagSnapshotModule,
  makeRegistrationLandingAtoms,
} from "@proxus/frontend-core/feature-flags"
import {
  FeatureFlagInstallationIdentityWebLive,
} from "../../platform/feature-flags/installation-identity.web.js"
import { makeFeatureFlagDistributionWebLive } from "../../platform/feature-flags/distribution.web.js"
import { registrationLandingAnalyticsWebLayer } from "../../platform/feature-flags/landing.web.js"
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
export const registrationStepViewedAnalyticsAction = landing.registrationStepViewedAtom
export const registrationStepCompletedAnalyticsAction = landing.registrationStepCompletedAtom
