import { AccessControlServiceLive } from "@proxus/backend-domain/access-control"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { AdminUsersServiceLive } from "@proxus/backend-domain/auth"
import { RoleAssignmentsRepositoryPostgresLive } from "@proxus/backend-infra/access-control/postgres"
import { MailgunEmailDeliveryLive, PasswordsLive, SecureVerificationCodeGeneratorLive, makeAuthPersistencePostgresLive, makeAuthenticationLive, makeOpaqueSessionsLive } from "@proxus/backend-infra/auth/production"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { StudyCatalogRepositoryPostgresLive } from "@proxus/backend-infra/study-catalog/postgres"
import { Layer } from "effect"

const ttl = 30 * 24 * 60 * 60 * 1000
const Database = makePostgresProductionLive("proxus-admin-server")
const Persistence = Layer.mergeAll(PostgresMigrationCheckLive, StudyCatalogRepositoryPostgresLive, RoleAssignmentsRepositoryPostgresLive, makeAuthPersistencePostgresLive(ttl)).pipe(Layer.provide(Database))
const Opaque = makeOpaqueSessionsLive({ ttlMillis: ttl, renewalWindowMillis: 7 * 24 * 60 * 60 * 1000, rotationGraceMillis: 30_000 }).pipe(Layer.provide(Persistence))
const Authentication = makeAuthenticationLive({ passwordResetTtlMillis: 15 * 60_000, passwordResetMaximumAttempts: 5 }).pipe(
  Layer.provide(Layer.mergeAll(Persistence, Opaque, PasswordsLive, SecureVerificationCodeGeneratorLive, MailgunEmailDeliveryLive)),
)
const AccessControl = AccessControlServiceLive.pipe(Layer.provide(Persistence))
const AdminUsers = AdminUsersServiceLive.pipe(Layer.provide(Layer.merge(Persistence, AccessControl)))
export const AdminProdLive = Layer.mergeAll(Persistence, Authentication, AccessControl, AdminUsers, StudyCatalogLive.pipe(Layer.provide(Layer.merge(Persistence, AccessControl))))
