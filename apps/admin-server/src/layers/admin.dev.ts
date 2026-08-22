import { AccessControlServiceLive } from "@proxus/backend-domain/access-control"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { RoleAssignmentsRepositoryPgliteLive } from "@proxus/backend-infra/access-control/pglite"
import { AdminUsersServiceLive } from "@proxus/backend-domain/auth"
import { ConsoleEmailDelivery, PasswordsLive, DevelopmentVerificationCodeGeneratorLive, makeAuthPersistencePgliteLive, makeAuthenticationLive, makeOpaqueSessionsLive } from "@proxus/backend-infra/auth"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { UgcManagementServiceLive } from "@proxus/backend-domain/ugc-management"
import { UgcRepositoryPgliteLive } from "@proxus/backend-infra/ugc-management/pglite"
import { UgcSupportingServicesLive } from "@proxus/backend-infra/ugc-management/services"
import { Layer } from "effect"

const ttl = 30 * 24 * 60 * 60 * 1000

export const makeAdminDevLive = (database: typeof PgliteDevelopmentLive) => {
  const persistence = Layer.mergeAll(PgliteMigrationLive, StudyCatalogRepositoryPgliteLive, RoleAssignmentsRepositoryPgliteLive, makeAuthPersistencePgliteLive(ttl), UgcRepositoryPgliteLive).pipe(Layer.provide(database))
  const opaque = makeOpaqueSessionsLive({ ttlMillis: ttl, renewalWindowMillis: 7 * 24 * 60 * 60 * 1000, rotationGraceMillis: 30_000 }).pipe(Layer.provide(persistence))
  const authentication = makeAuthenticationLive({ passwordResetTtlMillis: 15 * 60_000, passwordResetMaximumAttempts: 5 }).pipe(
    Layer.provide(Layer.mergeAll(persistence, opaque, PasswordsLive, DevelopmentVerificationCodeGeneratorLive, ConsoleEmailDelivery)),
  )
  const accessControl = AccessControlServiceLive.pipe(Layer.provide(persistence))
  const adminUsers = AdminUsersServiceLive.pipe(Layer.provide(Layer.merge(persistence, accessControl)))
  const ugc = UgcManagementServiceLive.pipe(Layer.provide(Layer.merge(persistence, UgcSupportingServicesLive)))
  return Layer.mergeAll(
    persistence,
    authentication,
    accessControl,
    adminUsers,
    ugc,
    StudyCatalogLive.pipe(Layer.provide(Layer.merge(persistence, accessControl))),
  )
}

export const AdminDevLive = makeAdminDevLive(PgliteDevelopmentLive)
