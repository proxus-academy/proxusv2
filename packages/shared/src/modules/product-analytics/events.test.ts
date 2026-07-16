import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { RecordProductAnalyticsBatchRequest } from "./api.js"

describe("product analytics contract", () => {
  it("accepts only the closed, bounded event union", () => {
    const decode = Schema.decodeUnknownSync(RecordProductAnalyticsBatchRequest)
    expect(decode({ events: [{ _tag: "registration_cta_clicked", flagKey: "registration.cta", configurationRevision: 1, allocationVersion: 1, reportedVariant: "control" }] }).events).toHaveLength(1)
    expect(() => decode({ events: [{ _tag: "registration_completed", source: "direct" }] })).toThrow()
    expect(() => decode({ events: [{ _tag: "arbitrary", freeText: "pii" }] })).toThrow()
    expect(() => decode({ events: [] })).toThrow()
  })
})
