import { describe, expect, test } from "vitest"
import { featureFlagEtagFor, ifNoneMatchMatches } from "./http.js"

describe("feature flag conditional requests", () => {
  const current = featureFlagEtagFor(7)

  test.each([
    current,
    `W/${current}`,
    `"other", ${current}`,
    `W/"other", W/${current}`,
    "*",
  ])("uses weak If-None-Match comparison for %s", (header) => {
    expect(ifNoneMatchMatches(header, current)).toBe(true)
  })

  test.each([undefined, '"other"', 'W/"other"', "not-an-etag"])("does not match %s", (header) => {
    expect(ifNoneMatchMatches(header, current)).toBe(false)
  })
})
