import { GoogleIdentityProvider, GoogleIdentityRejected, UserRepository, type User } from "@proxus/backend-domain/auth"
import { makeGoogleFlowLive } from "@proxus/backend-domain/auth/google-live"
import {
  ConsoleEmailDelivery,
  GoogleSessionIssuerLive,
  PasswordsLive,
  ProductionEmailDeliveryUnavailable,
  SecureSessionRandomLive,
  SecureVerificationCodeGeneratorLive,
  makeAuthPersistencePgliteLive,
  makeAuthPersistencePostgresLive,
  makeAuthenticationLive,
  makeConsoleEmailDelivery,
  makeEmailRegistrationServiceLive,
  makeFakeGoogleIdentityProvider,
  makeGoogleSecurityLive,
  makeOpaqueSessionsLive,
} from "@proxus/backend-infra/auth"
import { PgliteDevelopmentLive } from "@proxus/backend-infra/database/pglite"
import { makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { AuthSessionView, makeAuthSessionCookies } from "@proxus/backend-transport/auth"
import { AccountSummary, CurrentSession } from "@proxus/shared/auth"
import { Config, Effect, Layer, Option, Schema } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"

const day = 86_400_000
const sessionPolicy = { ttlMillis: 30 * day, renewalWindowMillis: 7 * day, rotationGraceMillis: 10_000 }
const registrationPolicy = { challengeTtlMillis: 15 * 60_000, resendCooldownMillis: 60_000, maximumAttempts: 5 }
const authenticationPolicy = { passwordResetTtlMillis: 15 * 60_000, passwordResetMaximumAttempts: 5 }

const AuthSessionViewLive = Layer.effect(AuthSessionView, Effect.gen(function*() {
  const users = yield* UserRepository
  const account = (user: User) => Schema.decodeUnknownEffect(AccountSummary)({
    id: user.id,
    email: user.email,
    username: user.usernameNormalized,
    status: user.status,
    provider: user.passwordHash === null ? "google" : user.googleSubject === null ? "email" : "both",
  }).pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
  return AuthSessionView.of({
    account,
    fromIssued: ({ session }) => users.getById(session.userId).pipe(
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new HttpApiError.InternalServerError({})),
        onSome: (user) => account(user).pipe(Effect.flatMap((summary) => Schema.decodeUnknownEffect(CurrentSession)({
          sessionId: session.id,
          account: summary,
          expiresAt: session.expiresAt.toISOString(),
        }).pipe(Effect.mapError(() => new HttpApiError.InternalServerError({}))))),
      })),
      Effect.mapError(() => new HttpApiError.InternalServerError({})),
    ),
  })
}))

const sessionServices = Layer.merge(
  makeOpaqueSessionsLive(sessionPolicy),
  GoogleSessionIssuerLive.pipe(Layer.provide(makeOpaqueSessionsLive(sessionPolicy))),
)
const services = Layer.mergeAll(
  makeEmailRegistrationServiceLive(registrationPolicy),
  makeAuthenticationLive(authenticationPolicy),
  makeGoogleFlowLive({ stateTtlMillis: 10 * 60_000, pendingTtlMillis: 30 * 60_000 }),
).pipe(Layer.provideMerge(sessionServices))

const cookies = makeAuthSessionCookies({ secure: true, sameSite: "lax" })

export const makeAuthDevLive = (email = ConsoleEmailDelivery, google = makeFakeGoogleIdentityProvider([
  { code: "dev-google-new", identity: { subject: "dev-google-user", email: "google@example.test", emailVerified: true, displayName: "Development User" } },
  { code: "dev-google-existing", identity: { subject: "qa-google:student-google", email: "student.google.qa@proxus.dev", emailVerified: true, displayName: "QA Existing User" } },
]), persistence = makeAuthPersistencePgliteLive(sessionPolicy.ttlMillis).pipe(Layer.provide(PgliteDevelopmentLive))) => {
  const dependencies = Layer.mergeAll(PasswordsLive, SecureVerificationCodeGeneratorLive, SecureSessionRandomLive, email, google,
    makeGoogleSecurityLive("proxus-development-google-secret-32-bytes-minimum"), persistence)
  return Layer.mergeAll(services.pipe(Layer.provide(dependencies)), AuthSessionViewLive.pipe(Layer.provide(persistence)), cookies)
}

export const AuthDevLive = makeAuthDevLive()

class UnsafeProductionAuthAdapter extends Schema.TaggedErrorClass<UnsafeProductionAuthAdapter>()("UnsafeProductionAuthAdapter", { message: Schema.String }) {}

export const validateProductionAuthAdapters = (email: string, google: string) =>
  email === "console" || google === "fake"
    ? Effect.fail(new UnsafeProductionAuthAdapter({ message: "Development auth adapters are forbidden in production" }))
    : Effect.void

const ProductionAuthSafety = Layer.effectDiscard(Effect.gen(function*() {
  const email = yield* Config.string("AUTH_EMAIL_ADAPTER").pipe(Config.withDefault("real"))
  const google = yield* Config.string("AUTH_GOOGLE_ADAPTER").pipe(Config.withDefault("real"))
  yield* validateProductionAuthAdapters(email, google)
}))

const ProductionGoogleUnavailable = Layer.succeed(GoogleIdentityProvider, GoogleIdentityProvider.of({
  authorizationUrl: () => Effect.fail(new GoogleIdentityRejected({ reason: "provider-failure" })),
  exchangeCallback: () => Effect.fail(new GoogleIdentityRejected({ reason: "provider-failure" })),
}))

const prodPersistence = makeAuthPersistencePostgresLive(sessionPolicy.ttlMillis).pipe(Layer.provide(makePostgresProductionLive("proxus-server-auth")))
const prodDependencies = Layer.mergeAll(
  PasswordsLive, SecureVerificationCodeGeneratorLive, SecureSessionRandomLive,
  ProductionEmailDeliveryUnavailable, ProductionGoogleUnavailable, prodPersistence,
  Layer.unwrap(Config.redacted("AUTH_GOOGLE_SIGNING_SECRET").pipe(Effect.map((secret) => makeGoogleSecurityLive(secret.toString())))),
)
export const AuthProdLive = Layer.mergeAll(
  services.pipe(Layer.provide(prodDependencies)),
  AuthSessionViewLive.pipe(Layer.provide(prodPersistence)),
  cookies,
  ProductionAuthSafety,
)


