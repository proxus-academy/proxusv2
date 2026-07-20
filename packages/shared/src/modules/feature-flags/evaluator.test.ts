import { describe, expect, it } from "vitest"
import {
  RegistrationLanding,
  defineFeatureFlag,
  evaluateFeatureFlag,
  featureFlagBucket,
  fnv1aUtf8,
  makeFeatureFlagSubjectId,
  parseFeatureFlagSubjectId,
} from "./index.js"

describe("feature flag evaluator", () => {
  it.each([
    ["", 2_166_136_261],
    ["hello", 1_335_831_723],
    ["instalación-🚀", 4_187_214_843],
  ])("hashes %j as FNV-1a over UTF-8", (input, hash) => {
    expect(fnv1aUtf8(input)).toBe(hash)
  })

  it.each([
    ["00000000-0000-4000-8000-000000000001", 3_678, "short"],
    ["00000000-0000-4000-8000-000000000002", 6_059, "long"],
  ] as const)("keeps golden allocation for %s", (subject, bucket, value) => {
    const subjectId = makeFeatureFlagSubjectId(subject)
    expect(featureFlagBucket(RegistrationLanding, subjectId)).toBe(bucket)
    expect(evaluateFeatureFlag(RegistrationLanding, subject)).toEqual({
      key: "registration.landing",
      value,
      allocationVersion: 1,
      source: "allocation",
    })
  })

  it("accepts only UUID v4 subjects and canonicalizes their case", () => {
    const lower = "abcdefab-cdef-4abc-8def-abcdefabcdef"
    const upper = lower.toUpperCase()
    expect(makeFeatureFlagSubjectId(upper)).toBe(lower)
    expect(evaluateFeatureFlag(RegistrationLanding, upper)).toEqual(
      evaluateFeatureFlag(RegistrationLanding, lower),
    )
    for (const invalid of ["installation-alpha", " ", "00000000-0000-1000-8000-000000000001", "00000000-0000-4000-7000-000000000001"]) {
      expect(parseFeatureFlagSubjectId(invalid)).toBeNull()
      expect(evaluateFeatureFlag(RegistrationLanding, invalid).source).toBe("default")
    }
    expect(evaluateFeatureFlag(RegistrationLanding, null).value).toBe("short")
  })

  it("uses half-open variant intervals", () => {
    const definition = defineFeatureFlag({
      key: "boundary.test",
      allocationVersion: 1,
      assignmentUnit: "installation",
      default: "first",
      variants: [["first", 1], ["second", 9_999]],
    } as const)
    const subject = makeFeatureFlagSubjectId("00000000-0000-4000-8000-000000006503")
    expect(featureFlagBucket(definition, subject)).toBe(1)
    expect(evaluateFeatureFlag(definition, subject).value).toBe("second")
  })

  it("returns an immutable copy rather than trusting mutable input", () => {
    const variants: Array<readonly ["a" | "b", number]> = [["a", 5_000], ["b", 5_000]]
    const definition = defineFeatureFlag({
      key: "immutable.test",
      allocationVersion: 1,
      assignmentUnit: "installation",
      default: "a",
      variants,
    })
    variants[0] = ["a", 10_000]
    expect(definition.variants).toEqual([["a", 5_000], ["b", 5_000]])
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.variants)).toBe(true)
    expect(Object.isFrozen(definition.variants[0])).toBe(true)
  })

  it.each([
    [{ key: "bad:key", allocationVersion: 1, assignmentUnit: "installation", default: "a", variants: [["a", 10_000]] }, /canonical/],
    [{ key: "invalid", allocationVersion: 0, assignmentUnit: "installation", default: "a", variants: [["a", 10_000]] }, /positive/],
    [{ key: "invalid", allocationVersion: 1, assignmentUnit: "installation", default: "a", variants: [["a", 5_000], ["a", 5_000]] }, /duplicate/],
    [{ key: "invalid", allocationVersion: 1, assignmentUnit: "installation", default: "a", variants: [["a", 9_999]] }, /sum/],
    [{ key: "invalid", allocationVersion: 1, assignmentUnit: "installation", default: "b", variants: [["a", 10_000]] }, /default/],
  ] as const)("rejects invalid definitions", (input, message) => {
    expect(() => defineFeatureFlag(input)).toThrow(message)
  })
})
