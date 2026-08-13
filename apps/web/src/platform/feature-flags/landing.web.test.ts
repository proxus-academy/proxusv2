import type { RegistrationLandingAssignment } from "@proxus/frontend-core/feature-flags"
import { makeFeatureFlagSubjectId } from "@proxus/shared/feature-flags"
import { RecordProductAnalyticsBatchRequest } from "@proxus/shared/product-analytics"
import { Effect, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"
import { makeRegistrationLandingAnalyticsWeb } from "./landing.web.js"

const assignment: RegistrationLandingAssignment = {
  flagKey: "registration.landing",
  variant: "long",
  revision: 4,
  subject: makeFeatureFlagSubjectId("00000000-0000-4000-8000-000000000002"),
}

const makeStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const decodeAnalyticsBatch = Schema.decodeUnknownSync(
  Schema.fromJsonString(RecordProductAnalyticsBatchRequest),
)

describe("registration landing analytics web adapter", () => {
  it("checks consent, schema-encodes the contract, and deduplicates exposure", () => Effect.runPromise(Effect.gen(function*() {
    const storage = makeStorage()
    let body: BodyInit | null = null
    const request = vi.fn((_input: string, init: RequestInit) => {
      body = init.body ?? null
      return Promise.resolve()
    })
    const analytics = makeRegistrationLandingAnalyticsWeb(storage, request)

    yield* analytics.record(assignment, "feature_flag_exposed")
    expect(request).not.toHaveBeenCalled()

    storage.setItem("proxus.analytics.consent", "granted")
    yield* analytics.record(assignment, "feature_flag_exposed")
    yield* analytics.record(assignment, "feature_flag_exposed")
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith("/api/product-analytics/events", expect.objectContaining({ method: "POST" }))
    // SAFETY: Runtime representation is checked at this boundary before use.
    if (typeof body !== "string") throw new Error("analytics request body was not encoded")
    expect(decodeAnalyticsBatch(body)).toMatchObject({
      events: [{ _tag: "feature_flag_exposed", revision: 4, variant: "long" }],
    })
  })))

  it("fails closed without defects when storage is unavailable", () => Effect.runPromise(Effect.gen(function*() {
    const request = vi.fn(() => Promise.resolve())
    const blockedStorage = {
      getItem: (_key: string): string | null => {
        throw new Error("storage read blocked")
      },
      setItem: (_key: string, _value: string): void => {
        throw new Error("storage write blocked")
      },
    }
    const blockedExposureStorage = {
      getItem: (key: string): string | null => {
        if (key === "proxus.analytics.consent") return "granted"
        throw new Error("storage read blocked")
      },
      setItem: (_key: string, _value: string): void => {
        throw new Error("storage write blocked")
      },
    }

    yield* makeRegistrationLandingAnalyticsWeb(blockedStorage, request).record(assignment, "registration_started")
    yield* makeRegistrationLandingAnalyticsWeb(blockedExposureStorage, request).record(assignment, "feature_flag_exposed")
    expect(request).not.toHaveBeenCalled()
  })))
})
