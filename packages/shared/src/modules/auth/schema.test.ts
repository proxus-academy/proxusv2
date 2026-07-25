import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  AuthRequestAccepted,
  GoogleCallbackResult,
  NewGoogleRegistration,
  RegisterWithEmailInput,
} from "./contract.js"
import { makeGoogleRegistrationId, VerificationCode } from "./model.js"

const ids = {
  countryId: "00000000-0000-4000-8000-000000000001",
  studyTypeId: "00000000-0000-4000-8000-000000000002",
  universityId: "00000000-0000-4000-8000-000000000003",
  degreeId: "00000000-0000-4000-8000-000000000004",
  subjectId: "00000000-0000-4000-8000-000000000005",
}

const validRegistration = {
  email: "learner@example.com",
  password: "correct horse battery staple",
  onboarding: {
    username: "learner_1",
    birthYear: 2001,
    problemKind: "prepare-exams",
    study: ids,
  },
}

describe("auth schemas", () => {
  it("round-trips an email registration wire payload", () => {
    const decoded = Schema.decodeUnknownSync(RegisterWithEmailInput)(validRegistration)
    const encoded = Schema.encodeSync(RegisterWithEmailInput)(decoded)
    expect(encoded).toEqual(validRegistration)
  })

  it("round-trips tagged Google callback results", () => {
    const result = new NewGoogleRegistration({
      registrationId: makeGoogleRegistrationId("00000000-0000-4000-8000-000000000006"),
      email: Schema.decodeUnknownSync(RegisterWithEmailInput.fields.email)("learner@example.com"),
    })
    const encoded = Schema.encodeSync(GoogleCallbackResult)(result)
    expect(Schema.decodeUnknownSync(GoogleCallbackResult)(encoded)).toEqual(result)
  })

  it.each([
    ["malformed email", { ...validRegistration, email: "not-an-email" }],
    ["short password", { ...validRegistration, password: "short" }],
    ["invalid username", { ...validRegistration, onboarding: { ...validRegistration.onboarding, username: "x" } }],
    ["fractional birth year", { ...validRegistration, onboarding: { ...validRegistration.onboarding, birthYear: 2001.5 } }],
    ["invalid study id", { ...validRegistration, onboarding: { ...validRegistration.onboarding, study: { ...ids, subjectId: "subject" } } }],
  ])("rejects %s", (_label, input) => {
    expect(() => Schema.decodeUnknownSync(RegisterWithEmailInput)(input)).toThrow()
  })

  it("accepts only six decimal digits as a verification code", () => {
    expect(Schema.decodeUnknownSync(VerificationCode)("123456")).toBe("123456")
    for (const invalid of ["12345", "1234567", "12a456"]) {
      expect(() => Schema.decodeUnknownSync(VerificationCode)(invalid)).toThrow()
    }
  })

  it("keeps anti-enumeration acknowledgements neutral", () => {
    expect(Schema.encodeSync(AuthRequestAccepted)(new AuthRequestAccepted({ accepted: true })))
      .toEqual({ accepted: true })
  })
})
