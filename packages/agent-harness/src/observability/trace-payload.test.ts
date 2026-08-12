import { describe, expect, it } from "vitest"
import { MAX_TRACE_DELTA_BYTES, redactTraceValue, truncateTraceDelta } from "./trace-payload.js"

describe("technical trace payload policy", () => {
  it("redacts credential-shaped keys and values recursively", () => {
    expect(redactTraceValue({ Authorization: "Bearer abc.def", nested: { api_key: "AIza1234567890123456789012345", text: "Bearer token" } })).toEqual({
      Authorization: "[REDACTED]",
      nested: { api_key: "[REDACTED]", text: "[REDACTED]" },
    })
  })

  it("truncates deltas by encoded bytes explicitly", () => {
    const result = truncateTraceDelta("🙂".repeat(MAX_TRACE_DELTA_BYTES))
    expect(result.truncated).toBe(true)
    expect(new TextEncoder().encode(result.text).byteLength).toBeLessThanOrEqual(MAX_TRACE_DELTA_BYTES)
  })
})
