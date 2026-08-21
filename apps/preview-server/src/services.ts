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
import { ApplicationRealtimeLive } from "@proxus/backend-domain/realtime"
import { AdminSessionAuthorizationLive } from "@proxus/backend-admin-transport/session"
import { RoleAssignmentsRepositoryPostgresLive } from "@proxus/backend-infra/access-control/postgres"
import {
  ConsoleEmailDelivery,
  GoogleSessionIssuerLive,
  PasswordsLive,
  SecureSessionRandomLive,
  DevelopmentVerificationCodeGeneratorLive,
  makeAuthPersistencePostgresLive,
  makeAuthenticationLive,
  makeEmailRegistrationServiceLive,
  makeFakeGoogleIdentityProvider,
  makeGoogleSecurityLive,
  makeOpaqueSessionsLive,
} from "@proxus/backend-infra/auth/preview-runtime"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { FeatureFlagSnapshotRepositoryPostgresLive } from "@proxus/backend-infra/feature-flags/postgres"
import { ProductAnalyticsRepositoryMemory } from "@proxus/backend-infra/product-analytics/memory"
import { StudyCatalogRepositoryPostgresLive } from "@proxus/backend-infra/study-catalog/postgres"
import { AuthSessionView, makeAuthSessionCookies } from "@proxus/backend-transport/auth"
import { ProductAnalyticsHttpContextDevelopment } from "@proxus/backend-transport/product-analytics"
import { AccountSummary, CurrentSession } from "@proxus/shared/auth"
import { Config, Effect, Layer, Option, Schema } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"

const day = 86_400_000
const sessionPolicy = { ttlMillis: 30 * day, renewalWindowMillis: 7 * day, rotationGraceMillis: 10_000 }
const registrationPolicy = { challengeTtlMillis: 15 * 60_000, resendCooldownMillis: 60_000, maximumAttempts: 5 }
const authenticationPolicy = { passwordResetTtlMillis: 15 * 60_000, passwordResetMaximumAttempts: 5 }

const database = makePostgresProductionLive("proxus-preview")
const persistence = Layer.mergeAll(
  RoleAssignmentsRepositoryPostgresLive,
  StudyCatalogRepositoryPostgresLive,
  FeatureFlagSnapshotRepositoryPostgresLive,
  makeAuthPersistencePostgresLive(sessionPolicy.ttlMillis),
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
const sessionServices = Layer.merge(opaqueSessions, GoogleSessionIssuerLive.pipe(Layer.provide(opaqueSessions)))
const google = makeFakeGoogleIdentityProvider([
  { code: "preview-google-new", identity: { subject: "preview-google-user", email: "google@example.test", emailVerified: true, displayName: "Preview User" } },
  { code: "preview-google-existing", identity: { subject: "qa-google:student-google", email: "student.google.qa@proxus.dev", emailVerified: true, displayName: "QA Existing User" } },
])
const authDependencies = Layer.mergeAll(
  persistence,
  PasswordsLive,
  DevelopmentVerificationCodeGeneratorLive,
  SecureSessionRandomLive,
  ConsoleEmailDelivery,
  google,
  Layer.unwrap(Config.string("AUTH_GOOGLE_SIGNING_SECRET").pipe(Effect.map(makeGoogleSecurityLive))),
)
const auth = Layer.mergeAll(
  makeEmailRegistrationServiceLive(registrationPolicy),
  RegistrationAvailability.layer,
  makeAuthenticationLive(authenticationPolicy),
  makeGoogleFlowLive({ stateTtlMillis: 10 * 60_000, pendingTtlMillis: 30 * 60_000 }),
).pipe(Layer.provideMerge(sessionServices), Layer.provide(authDependencies), Layer.provide(ApplicationRealtimeLive))
const access = AccessControlServiceLive.pipe(Layer.provide(persistence))
const catalog = StudyCatalogLive.pipe(Layer.provide(Layer.merge(persistence, access)))
const studyPath = StudyPathValidator.layer.pipe(Layer.provide(catalog))
const authSurface = Layer.mergeAll(
  auth.pipe(Layer.provide(studyPath)),
  AuthSessionViewLive.pipe(Layer.provide(persistence)),
  makeAuthSessionCookies({ secure: true, sameSite: "lax" }),
)
const analytics = ProductAnalyticsLive.pipe(Layer.provide(ProductAnalyticsRepositoryMemory))
const flags = FeatureFlagSnapshotReaderLive.pipe(Layer.provide(persistence))
const adminUsers = AdminUsersServiceLive.pipe(Layer.provide(Layer.merge(persistence, access)))

const migrationCheck = PostgresMigrationCheckLive.pipe(Layer.provide(database))

const sharedServices = Layer.merge(
  Layer.mergeAll(persistence, authSurface, access, catalog, studyPath),
  Layer.mergeAll(analytics, ProductAnalyticsHttpContextDevelopment, flags, adminUsers, migrationCheck, ApplicationRealtimeLive),
)
const adminSession = AdminSessionAuthorizationLive.pipe(Layer.provide(sharedServices))

export const PreviewPublicSupportLive = Layer.merge(authSurface, studyPath)
const previewServices = Layer.mergeAll(sharedServices, adminSession, authSurface, studyPath)
export const PreviewServicesLive = Layer.merge(
  previewServices.pipe(Layer.provide(PreviewPublicSupportLive)),
  PreviewPublicSupportLive,
)
