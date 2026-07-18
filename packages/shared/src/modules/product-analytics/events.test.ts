import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { MaximumConfigurationRevision } from "../feature-flags/api.js"
import { RecordProductAnalyticsBatchRequest } from "./api.js"

describe("product analytics contract", () => {
  it("accepts only the closed, bounded event union", () => {
    const decode = Schema.decodeUnknownSync(RecordProductAnalyticsBatchRequest)
    expect(decode({ events: [{ _tag: "registration_cta_clicked", flagKey: "registration.cta", configurationRevision: MaximumConfigurationRevision, allocationVersion: 1, reportedVariant: "control" }] }).events).toHaveLength(1)
    expect(() => decode({ events: [{ _tag: "registration_cta_clicked", flagKey: "registration.cta", configurationRevision: MaximumConfigurationRevision + 1, allocationVersion: 1, reportedVariant: "control" }] })).toThrow()
    expect(() => decode({ events: [{ _tag: "registration_completed", source: "direct" }] })).toThrow()
    expect(() => decode({ events: [{ _tag: "arbitrary", freeText: "pii" }] })).toThrow()
    expect(() => decode({ events: [] })).toThrow()
  })
})
