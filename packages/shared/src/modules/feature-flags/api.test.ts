import { PublicApi } from "../../public-api.js"
import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import {
  FeatureFlagSnapshot,
  MaximumConfigurationRevision,
  PublishedFeatureFlagSnapshot,
} from "./api.js"

const valid = {
  configurationRevision: MaximumConfigurationRevision,
  flags: [{ key: "registration.cta", enabled: true, allocationVersion: 1, default: "control", variants: [
    { value: "control", weight: 5_000 }, { value: "benefitCopy", weight: 5_000 },
  ] }],
}

describe("FeatureFlagSnapshot wire schema", () => {
  test("reserves revision zero for the synthetic empty snapshot", () => {
    expect(Schema.decodeUnknownSync(FeatureFlagSnapshot)({
      configurationRevision: 0,
      flags: [],
    })).toEqual({ configurationRevision: 0, flags: [] })
    expect(() => Schema.decodeUnknownSync(FeatureFlagSnapshot)({
      configurationRevision: 0,
      flags: valid.flags,
    })).toThrow()
    expect(() => Schema.decodeUnknownSync(PublishedFeatureFlagSnapshot)({
      configurationRevision: 0,
      flags: [],
    })).toThrow()
  })

  test("accepts the complete lossless published revision range", () => {
    expect(
      Schema.decodeUnknownSync(PublishedFeatureFlagSnapshot)(valid)
        .configurationRevision,
    ).toBe(Number.MAX_SAFE_INTEGER)
  })

  test("declares conditional request and response semantics in OpenAPI", () => {
    const operation = OpenApi.fromApi(PublicApi).paths["/feature-flags/snapshot"]?.get

    expect(operation?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "if-none-match", in: "header", required: false }),
    ]))
    expect(operation?.responses["200"]).toMatchObject({
      headers: {
        ETag: { required: true },
        "Cache-Control": { required: true },
      },
    })
    expect(operation?.responses["304"]).toMatchObject({
      headers: {
        ETag: { required: true },
        "Cache-Control": { required: true },
      },
    })
    expect(operation?.responses["500"]).toBeDefined()
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
