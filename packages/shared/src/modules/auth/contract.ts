import { Schema } from "effect"
import {
  CurrentSession,
  EmailAddress,
  GoogleRegistrationId,
  OnboardingInput,
  Password,
  VerificationCode,
} from "./model.js"

export class RegisterWithEmailInput extends Schema.Class<RegisterWithEmailInput>(
  "RegisterWithEmailInput",
)({
  email: EmailAddress,
  password: Password,
  onboarding: OnboardingInput,
}) {}

export class VerifyEmailInput extends Schema.Class<VerifyEmailInput>("VerifyEmailInput")({
  email: EmailAddress,
  code: VerificationCode,
}) {}

export class ResendVerificationInput extends Schema.Class<ResendVerificationInput>(
  "ResendVerificationInput",
)({ email: EmailAddress }) {}

export class LoginWithPasswordInput extends Schema.Class<LoginWithPasswordInput>(
  "LoginWithPasswordInput",
)({ email: EmailAddress, password: Password }) {}

export class RequestPasswordResetInput extends Schema.Class<RequestPasswordResetInput>(
  "RequestPasswordResetInput",
)({ email: EmailAddress }) {}

export class ResetPasswordInput extends Schema.Class<ResetPasswordInput>("ResetPasswordInput")({
  email: EmailAddress,
  code: VerificationCode,
  password: Password,
}) {}

/** A deliberately neutral acknowledgement used where account existence is secret. */
export class AuthRequestAccepted extends Schema.Class<AuthRequestAccepted>(
  "AuthRequestAccepted",
)({ accepted: Schema.Literal(true) }) {}

export class GoogleAuthorization extends Schema.Class<GoogleAuthorization>(
  "GoogleAuthorization",
)({ authorizationUrl: Schema.String.pipe(Schema.check(Schema.isPattern(/^https?:\/\//))) }) {}

export class GoogleCallbackInput extends Schema.Class<GoogleCallbackInput>(
  "GoogleCallbackInput",
)({ code: Schema.NonEmptyString, state: Schema.NonEmptyString }) {}

export class ExistingGoogleSession extends Schema.TaggedClass<ExistingGoogleSession>()(
  "ExistingGoogleSession",
  { session: CurrentSession },
) {}

export class NewGoogleRegistration extends Schema.TaggedClass<NewGoogleRegistration>()(
  "NewGoogleRegistration",
  { registrationId: GoogleRegistrationId, email: EmailAddress },
) {}

export const GoogleCallbackResult = Schema.Union([
  ExistingGoogleSession,
  NewGoogleRegistration,
])
export type GoogleCallbackResult = typeof GoogleCallbackResult.Type

export class CompleteGoogleRegistrationInput extends Schema.Class<CompleteGoogleRegistrationInput>(
  "CompleteGoogleRegistrationInput",
)({ registrationId: GoogleRegistrationId, onboarding: OnboardingInput }) {}
