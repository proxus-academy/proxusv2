import { Effect, Schema } from "effect"

const fixedMessage = (message: string) => Schema.String.pipe(
  Schema.withConstructorDefault(Effect.succeed(message)),
)

/** Does not reveal whether the email, password, account state, or provider failed. */
export class AuthenticationFailed extends Schema.TaggedErrorClass<AuthenticationFailed>()(
  "AuthenticationFailed",
  { message: fixedMessage("Authentication failed") },
  { httpApiStatus: 401 },
) {}

/** Does not reveal whether a challenge exists, expired, was consumed, or mismatched. */
export class AuthCodeInvalid extends Schema.TaggedErrorClass<AuthCodeInvalid>()(
  "AuthCodeInvalid",
  { message: fixedMessage("The code is invalid or expired") },
  { httpApiStatus: 400 },
) {}

export class AuthRegistrationConflict extends Schema.TaggedErrorClass<AuthRegistrationConflict>()(
  "AuthRegistrationConflict",
  { message: fixedMessage("Registration cannot be completed") },
  { httpApiStatus: 409 },
) {}

export class GoogleAuthenticationFailed extends Schema.TaggedErrorClass<GoogleAuthenticationFailed>()(
  "GoogleAuthenticationFailed",
  { message: fixedMessage("Google authentication failed") },
  { httpApiStatus: 401 },
) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { message: fixedMessage("Authentication required") },
  { httpApiStatus: 401 },
) {}
