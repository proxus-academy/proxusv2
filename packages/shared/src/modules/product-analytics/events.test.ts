import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { describe, expect, it } from "vitest"
import { PublicApi } from "../../public-api.js"
import { RecordProductAnalyticsBatchRequest } from "./api.js"
import {
  FeatureFlagExposed,
  PublicProductAnalyticsEvent,
  RegistrationCompleted,
  RegistrationStarted,
} from "./events.js"

const decode = Schema.decodeUnknownSync(RecordProductAnalyticsBatchRequest)
const encodeEvent = Schema.encodeSync(PublicProductAnalyticsEvent)
const context = {
  flagKey: "registration.landing",
  revision: Number.MAX_SAFE_INTEGER,
  variant: "short",
} as const

describe("product analytics contract", () => {
  it("accepts only the closed assignment-aware event union", () => {
    const [started] = decode({
      events: [{ _tag: "registration_started", ...context }],
    }).events
    expect(started).toBeInstanceOf(RegistrationStarted)
    expect(() => decode({ events: [] })).toThrow()
    expect(() => decode({
      events: Array.from(
        { length: 51 },
        () => new RegistrationStarted(context),
      ),
    })).toThrow()
    expect(() => decode({
      events: [{
        _tag: "registration_started",
        ...context,
        revision: Number.MAX_SAFE_INTEGER + 1,
      }],
    })).toThrow()
    expect(() => decode({
      events: [{ _tag: "registration_cta_clicked", ...context }],
    })).toThrow()
    expect(() => decode({
      events: [{
        _tag: "registration_completed",
        ...context,
        variant: "unknown",
      }],
    })).toThrow()
  })

  it.each([
    [new FeatureFlagExposed(context), "feature_flag_exposed"],
    [new RegistrationStarted(context), "registration_started"],
    [new RegistrationCompleted(context), "registration_completed"],
  ] as const)("preserves the %s wire tag", (event, tag) => {
    expect(encodeEvent(event)).toEqual({ _tag: tag, ...context })
  })

  it("keeps the batch endpoint success status at 200", () => {
    const operation = OpenApi.fromApi(PublicApi)
      .paths["/product-analytics/events"]?.post

    expect(operation?.responses["200"]).toBeDefined()
    expect(operation?.responses["201"]).toBeUndefined()
  })
})
