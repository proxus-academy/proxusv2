import { describe, expect, test } from "vitest"
import { assertNoPublicPrincipal, defaultRegion, validateRegion } from "./config.ts"

describe("infrastructure policy", () => {
  test("pins the Madrid region", () => {
    expect(defaultRegion).toBe("europe-southwest1")
    expect(validateRegion(defaultRegion)).toBe(defaultRegion)
    expect(() => validateRegion("europe-west1")).toThrow(/must be europe-southwest1/)
  })

  test.each(["allUsers", "allAuthenticatedUsers"])("rejects %s", (member) => {
    expect(() => assertNoPublicPrincipal(member)).toThrow(/forbidden/)
  })

  test("accepts narrow principals", () => {
    expect(() => assertNoPublicPrincipal("group:admins@example.com")).not.toThrow()
  })
})
