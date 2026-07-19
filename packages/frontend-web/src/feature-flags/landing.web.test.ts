import { makeFeatureFlagSubjectId } from "@proxus/shared/feature-flags"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { makeRegistrationLandingAnalyticsWeb } from "./landing.web.js"

const assignment = {
  flagKey: "registration.landing",
  variant: "long",
  revision: 4,
  subject: makeFeatureFlagSubjectId("00000000-0000-4000-8000-000000000002"),
} as const

const makeStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe("registration landing analytics web adapter", () => {
  // Vitest bridge around the Effect-valued adapter interface.
  // @effect-diagnostics-next-line asyncFunction:off
  it("checks consent before transport and deduplicates exposure", async () => {
    const storage = makeStorage()
    const request = vi.fn(() => Promise.resolve())
    const analytics = makeRegistrationLandingAnalyticsWeb(storage, request, "/api")

    await Effect.runPromise(analytics.record(assignment, "feature_flag_exposed"))
    expect(request).not.toHaveBeenCalled()

    storage.setItem("proxus.analytics.consent", "granted")
    await Effect.runPromise(analytics.record(assignment, "feature_flag_exposed"))
    await Effect.runPromise(analytics.record(assignment, "feature_flag_exposed"))
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith("/api/product-analytics/events", expect.objectContaining({ method: "POST" }))
  })
})
