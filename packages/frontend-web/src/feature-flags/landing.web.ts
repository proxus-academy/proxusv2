import { evaluateSnapshotFeatureFlag } from "@proxus/frontend-core/feature-flags"
import { RegistrationLanding, type FeatureFlagSnapshot, type RegistrationLandingVariant } from "@proxus/shared/feature-flags"
import type { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import { Effect } from "effect"
import { makeFeatureFlagInstallationIdentityWeb } from "./installation-identity.web.js"

export interface RegistrationLandingAssignment {
  readonly flagKey: "registration.landing"
  readonly variant: RegistrationLandingVariant
  readonly revision: number
  readonly subject: string
}
const seenKey = (a: RegistrationLandingAssignment) => `proxus.feature-flags.seen.v1:${a.subject}:${a.flagKey}:${a.revision}`
const decisionKey = (subject: string, revision: number) => `proxus.feature-flags.decision.v1:${subject}:${RegistrationLanding.key}:${revision}`

/** Browser adapter: stable anonymous identity and sticky decisions. Auth can supply a principal subject later. */
// Browser lifecycle bridge; application code consumes the adapter rather than browser globals.
// @effect-diagnostics-next-line asyncFunction:off
export const resolveRegistrationLanding = async (baseUrl = ""): Promise<RegistrationLandingAssignment> => {
  // @effect-diagnostics-next-line cryptoRandomUUID:off
  const identity = makeFeatureFlagInstallationIdentityWeb(localStorage, () => crypto.randomUUID())
  const subject = await Effect.runPromise(identity.getOrCreate())
  let snapshot: FeatureFlagSnapshot = { configurationRevision: 0, flags: [] }
  try {
    // @effect-diagnostics-next-line globalFetch:off
    const response = await fetch(`${baseUrl}/feature-flags/snapshot`)
    if (response.ok) snapshot = await response.json() as FeatureFlagSnapshot
  } catch { /* safe local fallback */ }
  const key = decisionKey(subject, snapshot.configurationRevision)
  const remembered = localStorage.getItem(key)
  const evaluated = evaluateSnapshotFeatureFlag(RegistrationLanding, snapshot, subject).value
  const variant = remembered === "short" || remembered === "long" ? remembered : evaluated
  localStorage.setItem(key, variant)
  return { flagKey: "registration.landing", variant, revision: snapshot.configurationRevision, subject }
}

/** Consent is checked before network I/O; assignment remains available without consent. */
// @effect-diagnostics-next-line asyncFunction:off
export const recordRegistrationAnalytics = async (
  assignment: RegistrationLandingAssignment,
  tag: PublicProductAnalyticsEvent["_tag"],
  baseUrl = "",
): Promise<void> => {
  if (localStorage.getItem("proxus.analytics.consent") !== "granted") return
  if (tag === "feature_flag_exposed") {
    const key = seenKey(assignment)
    if (localStorage.getItem(key) === "1") return
    localStorage.setItem(key, "1")
  }
  // @effect-diagnostics-next-line globalFetch:off
  await fetch(`${baseUrl}/product-analytics/events`, {
    method: "POST", headers: {
      "content-type": "application/json",
      "x-proxus-dev-analytics-consent": "granted",
      "x-proxus-dev-flag-subject": assignment.subject,
    },
    body: JSON.stringify({ events: [{ _tag: tag, flagKey: assignment.flagKey, variant: assignment.variant, revision: assignment.revision }] }),
  }).then(() => undefined).catch(() => undefined)
}
