import { describe, expect, test } from "vitest"
import { assertNoPublicPrincipal, defaultRegion, validateMailgunDomain, validateMailgunFrom, validateRegion } from "./config.ts"

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

  test("validates non-secret Mailgun routing configuration", () => {
    expect(validateMailgunDomain("mail.example.test")).toBe("mail.example.test")
    expect(validateMailgunFrom("Proxus <noreply@example.test>")).toBe("Proxus <noreply@example.test>")
    expect(() => validateMailgunDomain("https://mail.example.test")).toThrow(/lower-case DNS/)
    expect(() => validateMailgunFrom("Proxus\nBcc: victim@example.test")).toThrow(/without line breaks/)
  })
})
