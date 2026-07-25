import { Context, Data, Effect } from "effect"
import type { AuthChallengePurpose, GoogleAuthorizationRequest, GoogleCallback, VerifiedGoogleIdentity } from "./model.js"
import type { GoogleIdentityRejected } from "./model.js"

export class PasswordError extends Data.TaggedError("PasswordError")<{
  readonly operation: "hash" | "verify"
  readonly cause?: unknown
}> {}
export class VerificationCodeGenerationError extends Data.TaggedError("VerificationCodeGenerationError")<{ readonly cause?: unknown }> {}
export class EmailDeliveryError extends Data.TaggedError("EmailDeliveryError")<{
  readonly kind: "verification" | "password-reset"
  readonly cause?: unknown
}> {}

export class Passwords extends Context.Service<Passwords, {
  readonly hash: (password: string) => Effect.Effect<string, PasswordError>
  readonly verify: (password: string, hash: string) => Effect.Effect<boolean, PasswordError>
}>()("@proxus/backend-domain/modules/auth/ports/Passwords") {}

export class VerificationCodeGenerator extends Context.Service<VerificationCodeGenerator, {
  readonly generate: () => Effect.Effect<string, VerificationCodeGenerationError>
}>()("@proxus/backend-domain/modules/auth/ports/VerificationCodeGenerator") {}

export interface AuthEmailMessage {
  readonly recipient: string
  readonly purpose: AuthChallengePurpose
  readonly code: string
  readonly expiresAt: Date
}

export class EmailDelivery extends Context.Service<EmailDelivery, {
  readonly sendVerification: (message: AuthEmailMessage & { readonly purpose: "verify-email" }) => Effect.Effect<void, EmailDeliveryError>
  readonly sendPasswordReset: (message: AuthEmailMessage & { readonly purpose: "reset-password" }) => Effect.Effect<void, EmailDeliveryError>
}>()("@proxus/backend-domain/modules/auth/ports/EmailDelivery") {}

export class GoogleIdentityProvider extends Context.Service<GoogleIdentityProvider, {
  readonly authorizationUrl: (request: GoogleAuthorizationRequest) => Effect.Effect<string, GoogleIdentityRejected>
  readonly exchangeCallback: (callback: GoogleCallback) => Effect.Effect<VerifiedGoogleIdentity, GoogleIdentityRejected>
}>()("@proxus/backend-domain/modules/auth/ports/GoogleIdentityProvider") {}
