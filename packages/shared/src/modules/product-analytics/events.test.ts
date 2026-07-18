import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { RecordProductAnalyticsBatchRequest } from "./api.js"

const decode = Schema.decodeUnknownSync(RecordProductAnalyticsBatchRequest)
describe("product analytics contract", () => {
  it("accepts only the closed assignment-aware event union", () => {
    const context = { flagKey: "registration.landing", revision: Number.MAX_SAFE_INTEGER, variant: "short" }
    expect(decode({ events: [{ _tag: "registration_started", ...context }] }).events).toHaveLength(1)
    expect(() => decode({ events: [{ _tag: "registration_started", ...context, revision: Number.MAX_SAFE_INTEGER + 1 }] })).toThrow()
    expect(() => decode({ events: [{ _tag: "registration_cta_clicked", ...context }] })).toThrow()
    expect(() => decode({ events: [{ _tag: "registration_completed", ...context, variant: "unknown" }] })).toThrow()
  })
})
