import { AccessControlServiceLive } from "@proxus/backend-domain/access-control"
import {
  AdminUsersServiceLive,
  GoogleIdentityProvider,
  RegistrationAvailability,
  StudyPathValidator,
  UserRepository,
  type User,
} from "@proxus/backend-domain/auth"
import { makeGoogleFlowLive } from "@proxus/backend-domain/auth/google-live"
import { FeatureFlagSnapshotReaderLive } from "@proxus/backend-domain/feature-flags"
import { ProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { AdminSessionAuthorizationLive } from "@proxus/backend-admin-transport/session"
import { RoleAssignmentsRepositoryPgliteLive } from "@proxus/backend-infra/access-control/pglite"
import {
  ConsoleEmailDelivery,
  GoogleSessionIssuerLive,
  PasswordsLive,
  SecureSessionRandomLive,
  SecureVerificationCodeGeneratorLive,
  makeAuthPersistencePgliteLive,
  makeAuthenticationLive,
  makeEmailRegistrationServiceLive,
  makeFakeGoogleIdentityProvider,
  makeGoogleSecurityLive,
  makeOpaqueSessionsLive,
} from "@proxus/backend-infra/auth"
import { seedAuthQa } from "@proxus/backend-infra/auth-qa"
import { PgliteDevelopmentLive, defaultMigrationsFolder, migratePglite, seedPgliteStudyCatalog } from "@proxus/backend-infra/database/pglite"
import { FeatureFlagSnapshotRepositoryPgliteLive } from "@proxus/backend-infra/feature-flags/pglite"
import { ProductAnalyticsRepositoryPgliteLive } from "@proxus/backend-infra/product-analytics/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { AuthSessionView, makeAuthSessionCookies } from "@proxus/backend-transport/auth"
import { ProductAnalyticsHttpContextDevelopment } from "@proxus/backend-transport/product-analytics"
import { AccountSummary, CurrentSession } from "@proxus/shared/auth"
import { Config, Effect, Layer, Option, Schema } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"

const day = 86_400_000
const sessionPolicy = { ttlMillis: 30 * day, renewalWindowMillis: 7 * day, rotationGraceMillis: 10_000 }
const registrationPolicy = { challengeTtlMillis: 15 * 60_000, resendCooldownMillis: 60_000, maximumAttempts: 5 }
const authenticationPolicy = { passwordResetTtlMillis: 15 * 60_000, passwordResetMaximumAttempts: 5 }

const database = PgliteDevelopmentLive
const persistence = Layer.mergeAll(
  RoleAssignmentsRepositoryPgliteLive,
  StudyCatalogRepositoryPgliteLive,
  FeatureFlagSnapshotRepositoryPgliteLive,
  ProductAnalyticsRepositoryPgliteLive,
  makeAuthPersistencePgliteLive(sessionPolicy.ttlMillis),
).pipe(Layer.provide(database))

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

const opaqueSessions = makeOpaqueSessionsLive(sessionPolicy).pipe(Layer.provide(persistence))
const sessionServices = Layer.merge(
  opaqueSessions,
  GoogleSessionIssuerLive.pipe(Layer.provide(opaqueSessions)),
)
const google = makeFakeGoogleIdentityProvider([
  { code: "dev-google-new", identity: { subject: "dev-google-user", email: "google@example.test", emailVerified: true, displayName: "Development User" } },
  { code: "dev-google-existing", identity: { subject: "qa-google:student-google", email: "student.google.qa@proxus.dev", emailVerified: true, displayName: "QA Existing User" } },
])
const authDependencies = Layer.mergeAll(
  persistence,
  PasswordsLive,
  SecureVerificationCodeGeneratorLive,
  SecureSessionRandomLive,
  ConsoleEmailDelivery,
  google,
  makeGoogleSecurityLive("proxus-development-google-secret-32-bytes-minimum"),
)
const auth = Layer.mergeAll(
  makeEmailRegistrationServiceLive(registrationPolicy),
  RegistrationAvailability.layer,
  makeAuthenticationLive(authenticationPolicy),
  makeGoogleFlowLive({ stateTtlMillis: 10 * 60_000, pendingTtlMillis: 30 * 60_000 }),
).pipe(
  Layer.provideMerge(sessionServices),
  Layer.provide(authDependencies),
)
const access = AccessControlServiceLive.pipe(Layer.provide(persistence))
const catalog = StudyCatalogLive.pipe(Layer.provide(Layer.merge(persistence, access)))
const studyPath = StudyPathValidator.layer.pipe(Layer.provide(catalog))
const authSurface = Layer.mergeAll(
  auth.pipe(Layer.provide(studyPath)),
  AuthSessionViewLive.pipe(Layer.provide(persistence)),
  makeAuthSessionCookies({ secure: false, sameSite: "lax" }),
)
const analytics = ProductAnalyticsLive.pipe(Layer.provide(persistence))
const flags = FeatureFlagSnapshotReaderLive.pipe(Layer.provide(persistence))
const adminUsers = AdminUsersServiceLive.pipe(Layer.provide(Layer.merge(persistence, access)))

const seed = Layer.effectDiscard(Effect.gen(function*() {
  const migrations = yield* Config.string("DATABASE_MIGRATIONS_DIR").pipe(Config.withDefault(defaultMigrationsFolder))
  yield* migratePglite(migrations)
  yield* seedPgliteStudyCatalog
  yield* seedAuthQa()
})).pipe(Layer.provide(Layer.merge(database, Layer.merge(persistence, PasswordsLive))))

const sharedServices = Layer.merge(
  Layer.mergeAll(persistence, authSurface, access, catalog, studyPath),
  Layer.mergeAll(analytics, ProductAnalyticsHttpContextDevelopment, flags, adminUsers, seed),
)

const adminSession = AdminSessionAuthorizationLive.pipe(Layer.provide(sharedServices))

export const DevelopmentPublicSupportLive = Layer.merge(authSurface, studyPath)
const developmentServices = Layer.mergeAll(
  sharedServices,
  adminSession,
  authSurface,
  studyPath,
)
export const DevelopmentServicesLive = Layer.merge(
  developmentServices.pipe(Layer.provide(DevelopmentPublicSupportLive)),
  DevelopmentPublicSupportLive,
)
