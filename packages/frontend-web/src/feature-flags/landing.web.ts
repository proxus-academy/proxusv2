import { RegistrationLandingAnalytics, type RegistrationLandingAssignment } from "@proxus/frontend-core/feature-flags"
import type { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import { Effect, Layer, Schema } from "effect"

const encodeJson = Schema.encodeSync(Schema.UnknownFromJsonString)

const seenKey = (assignment: RegistrationLandingAssignment) =>
  `proxus.feature-flags.seen.v1:${assignment.subject}:${assignment.flagKey}:${assignment.revision}`

export const makeRegistrationLandingAnalyticsWeb = (
  storage: Pick<Storage, "getItem" | "setItem">,
  request: (input: string, init: RequestInit) => Promise<unknown>,
  baseUrl = "",
) => RegistrationLandingAnalytics.of({
  record: (assignment, tag) => Effect.suspend(() => {
    if (storage.getItem("proxus.analytics.consent") !== "granted") return Effect.void
    if (tag === "feature_flag_exposed") {
      const key = seenKey(assignment)
      if (storage.getItem(key) === "1") return Effect.void
      storage.setItem(key, "1")
    }
    const event: PublicProductAnalyticsEvent = {
      _tag: tag,
      flagKey: assignment.flagKey,
      variant: assignment.variant,
      revision: assignment.revision,
    }
    return Effect.tryPromise({
      try: () => request(`${baseUrl}/product-analytics/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-proxus-dev-analytics-consent": "granted",
          "x-proxus-dev-flag-subject": assignment.subject,
        },
        body: encodeJson({ events: [event] }),
      }),
      catch: () => undefined,
    }).pipe(Effect.ignore)
  }),
})

export const registrationLandingAnalyticsWebLayer = (baseUrl = "") => Layer.sync(
  RegistrationLandingAnalytics,
  () => makeRegistrationLandingAnalyticsWeb(
    window.localStorage,
    // Browser transport is intentionally localized at this adapter seam.
    // @effect-diagnostics-next-line globalFetch:off
    (input, init) => fetch(input, init),
    baseUrl,
  ),
)
