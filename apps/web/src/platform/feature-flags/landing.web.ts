import { RegistrationLandingAnalytics, type RegistrationLandingAssignment } from "@proxus/frontend-core/feature-flags"
import {
  PublicProductAnalyticsEvent,
  RecordProductAnalyticsBatchRequest,
} from "@proxus/shared/product-analytics"
import { Effect, Layer, Option, Schema } from "effect"
import { browserLocalStorage } from "./local-storage.web.js"

const AnalyticsBatchJson = Schema.fromJsonString(RecordProductAnalyticsBatchRequest)
const decodeAnalyticsBatch = Schema.decodeUnknownEffect(RecordProductAnalyticsBatchRequest)
const encodeAnalyticsBatch = Schema.encodeEffect(AnalyticsBatchJson)

const seenKey = (assignment: RegistrationLandingAssignment) =>
  `proxus.feature-flags.seen.v1:${assignment.subject}:${assignment.flagKey}:${assignment.revision}`

export const makeRegistrationLandingAnalyticsWeb = (
  storage: Pick<Storage, "getItem" | "setItem">,
  request: (input: string, init: RequestInit) => Promise<Response | void>,
  baseUrl = "/api",
) => RegistrationLandingAnalytics.of({
  record: (assignment, tag, step) => Effect.gen(function*() {
    const storageDecision = yield* Effect.option(Effect.try({
      try: () => {
        if (storage.getItem("proxus.analytics.consent") !== "granted") return false
        if (tag === "feature_flag_exposed") {
          const key = seenKey(assignment)
          if (storage.getItem(key) === "1") return false
          storage.setItem(key, "1")
        }
        return true
      },
      catch: () => undefined,
    }))
    if (Option.isNone(storageDecision) || !storageDecision.value) return

    const event = yield* Schema.decodeUnknownEffect(PublicProductAnalyticsEvent)({
      _tag: tag,
      flagKey: assignment.flagKey,
      variant: assignment.variant,
      revision: assignment.revision,
      ...(step === undefined ? {} : step),
    })
    const batch = yield* decodeAnalyticsBatch({ events: [event] })
    const body = yield* encodeAnalyticsBatch(batch)
    yield* Effect.tryPromise({
      try: () => request(`${baseUrl}/product-analytics/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-proxus-dev-analytics-consent": "granted",
          "x-proxus-dev-flag-subject": assignment.subject,
        },
        body,
      }),
      catch: () => undefined,
    })
  }).pipe(Effect.ignore),
})

export const registrationLandingAnalyticsWebLayer = (baseUrl = "/api") => Layer.sync(
  RegistrationLandingAnalytics,
  () => makeRegistrationLandingAnalyticsWeb(
    browserLocalStorage,
    // Browser transport is intentionally localized at this adapter seam.
    // @effect-diagnostics-next-line globalFetch:off
    (input, init) => fetch(input, init),
    baseUrl,
  ),
)
