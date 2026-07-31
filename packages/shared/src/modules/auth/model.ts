import { Schema } from "effect"
import { SubjectNodeId } from "../study-catalog/schema.js"

const uuidId = (brand: string) => Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand(brand),
)

export const AccountId = uuidId("AccountId")
export type AccountId = typeof AccountId.Type
export const makeAccountId = Schema.decodeUnknownSync(AccountId)

export const SessionId = uuidId("SessionId")
export type SessionId = typeof SessionId.Type
export const makeSessionId = Schema.decodeUnknownSync(SessionId)

export const GoogleRegistrationId = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(4096)),
  Schema.brand("GoogleRegistrationId"),
)
export type GoogleRegistrationId = typeof GoogleRegistrationId.Type
export const makeGoogleRegistrationId = Schema.decodeUnknownSync(GoogleRegistrationId)

export const EmailAddress = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  Schema.check(Schema.isMaxLength(254)),
  Schema.brand("EmailAddress"),
)
export type EmailAddress = typeof EmailAddress.Type

export const PASSWORD_MIN_LENGTH = 8

export const Password = Schema.String.pipe(
  Schema.check(Schema.isMinLength(PASSWORD_MIN_LENGTH)),
  Schema.check(Schema.isMaxLength(128)),
)

export const VerificationCode = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{6}$/)),
  Schema.brand("VerificationCode"),
)
export type VerificationCode = typeof VerificationCode.Type

export const Username = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9_]{3,30}$/)),
  Schema.brand("Username"),
)
export type Username = typeof Username.Type

export const AuthProvider = Schema.Literals(["email", "google", "both"])
export type AuthProvider = typeof AuthProvider.Type

export const AccountStatus = Schema.Literals(["pending", "active", "disabled"])
export type AccountStatus = typeof AccountStatus.Type

export const ProblemKind = Schema.Literals([
  "understand-content",
  "prepare-exams",
  "organize-study",
  "choose-studies",
  "other",
])
export type ProblemKind = typeof ProblemKind.Type

export const AcquisitionSource = Schema.Literals([
  "friend",
  "tiktok",
  "instagram",
  "whatsapp",
  "google",
  "ai",
  "event",
  "other",
])
export type AcquisitionSource = typeof AcquisitionSource.Type

export class StudySelectionInput extends Schema.Class<StudySelectionInput>(
  "StudySelectionInput",
)({
  subjectId: SubjectNodeId,
}) {}

export class OnboardingInput extends Schema.Class<OnboardingInput>(
  "OnboardingInput",
)({
  username: Username,
  birthYear: Schema.Number.pipe(Schema.check(Schema.isInt())),
  problemKind: ProblemKind,
  problemOtherText: Schema.optional(
    Schema.String.pipe(Schema.check(Schema.isMinLength(1)), Schema.check(Schema.isMaxLength(280))),
  ),
  acquisitionSource: AcquisitionSource,
  acquisitionOtherText: Schema.optional(
    Schema.String.pipe(Schema.check(Schema.isMinLength(1)), Schema.check(Schema.isMaxLength(200))),
  ),
  study: StudySelectionInput,
}) {}

export class AccountSummary extends Schema.Class<AccountSummary>("AccountSummary")({
  id: AccountId,
  email: EmailAddress,
  username: Username,
  status: AccountStatus,
  provider: AuthProvider,
}) {}

export class CurrentSession extends Schema.Class<CurrentSession>("CurrentSession")({
  sessionId: SessionId,
  account: AccountSummary,
  expiresAt: Schema.DateTimeUtcFromString,
}) {}
