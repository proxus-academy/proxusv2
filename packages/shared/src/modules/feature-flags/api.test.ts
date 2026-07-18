import { Schema } from "effect"
import { describe, expect, test } from "vitest"
import { FeatureFlagSnapshot, MaximumConfigurationRevision } from "./api.js"

const valid = {
  configurationRevision: MaximumConfigurationRevision,
  flags: [{ key: "registration.cta", enabled: true, allocationVersion: 1, default: "control", variants: [
    { value: "control", weight: 5_000 }, { value: "benefitCopy", weight: 5_000 },
  ] }],
}

describe("FeatureFlagSnapshot wire schema", () => {
  test("accepts the complete lossless revision range", () => {
    expect(Schema.decodeUnknownSync(FeatureFlagSnapshot)(valid).configurationRevision).toBe(Number.MAX_SAFE_INTEGER)
  })

  test.each([
    { ...valid, configurationRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, flags: [...valid.flags, valid.flags[0]] },
    { ...valid, flags: [{ ...valid.flags[0], key: "Invalid Key" }] },
    { ...valid, flags: [{ ...valid.flags[0], default: "missing" }] },
    { ...valid, flags: [{ ...valid.flags[0], variants: [{ value: "control", weight: 9_999 }] }] },
    { ...valid, flags: [{ ...valid.flags[0], variants: [{ value: "control", weight: 5_000 }, { value: "control", weight: 5_000 }] }] },
  ])("rejects invalid cross-field invariants", (input) => {
    expect(() => Schema.decodeUnknownSync(FeatureFlagSnapshot)(input)).toThrow()
  })
})
