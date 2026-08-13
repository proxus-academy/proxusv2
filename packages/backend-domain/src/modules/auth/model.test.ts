import { DateTime } from "effect"
import { describe, expect, it } from "vitest"
import { AuthProviderMissing, InvalidCredentials, InvalidUserState, authProviderOf, isEmailVerified, isUserActive, makeUser, normalizeEmail, type User, type UserId } from "./model.js"

const instant = (value: string): Date => DateTime.toDateUtc(DateTime.makeUnsafe(value))

const user = (overrides: Partial<User> = {}): User => makeUser({
  // SAFETY: The surrounding typed contract establishes the asserted representation.
  id: "user-1" as UserId,
  email: " Alice@Example.COM ",
  status: "pending",
  emailVerifiedAt: null,
  passwordHash: null,
  googleSubject: null,
  usernameNormalized: "alice",
  birthYear: 2000,
  problemKind: "organize-study",
  problemOther: null,
  acquisitionSource: "friend",
  acquisitionOther: null,
  studyId: "00000000-0000-4000-8000-000000000004",
  subjectId: "00000000-0000-4000-8000-000000000005",
  createdAt: instant("2026-01-01T00:00:00Z"),
  updatedAt: instant("2026-01-01T00:00:00Z"),
  ...overrides,
})

describe("auth domain model", () => {
  it("normalizes email deterministically and idempotently", () => {
    expect(normalizeEmail("  ALICE@Example.COM  ")).toBe("alice@example.com")
    expect(normalizeEmail(normalizeEmail("  ALICE@Example.COM  "))).toBe("alice@example.com")
    expect(makeUser({ ...user(), email: " ALICE@example.com " }).email).toBe("alice@example.com")
  })

  it.each([
    [{ passwordHash: "hash", googleSubject: null }, "email"],
    [{ passwordHash: null, googleSubject: "google-1" }, "google"],
    [{ passwordHash: "hash", googleSubject: "google-1" }, "both"],
    [{ passwordHash: null, googleSubject: null }, null],
  ] as const)("derives providers from credentials", (credentials, expected) => {
    expect(authProviderOf(user(credentials))).toBe(expected)
  })

  it("derives account and verification states", () => {
    expect(isUserActive(user())).toBe(false)
    expect(isEmailVerified(user())).toBe(false)
    const active = user({ status: "active", emailVerifiedAt: instant("2026-01-02T00:00:00Z") })
    expect(isUserActive(active)).toBe(true)
    expect(isEmailVerified(active)).toBe(true)
  })

  it("exposes discriminated domain errors", () => {
    expect(new InvalidCredentials()._tag).toBe("InvalidCredentials")
    // SAFETY: The surrounding typed contract establishes the asserted representation.
    expect(new InvalidUserState({ userId: "u" as UserId, actual: "disabled" }).actual).toBe("disabled")
    // SAFETY: The surrounding typed contract establishes the asserted representation.
    expect(new AuthProviderMissing({ userId: "u" as UserId })._tag).toBe("AuthProviderMissing")
  })
})
