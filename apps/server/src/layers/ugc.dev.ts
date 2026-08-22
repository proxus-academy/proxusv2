import { UgcManagementServiceLive } from "@proxus/backend-domain/ugc-management"
import { UgcRepositoryPgliteLive } from "@proxus/backend-infra/ugc-management/pglite"
import { UgcSupportingServicesLive } from "@proxus/backend-infra/ugc-management/services"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { Layer } from "effect"

const persistence = Layer.merge(PgliteMigrationLive, UgcRepositoryPgliteLive).pipe(Layer.provide(PgliteDevelopmentLive))

export const UgcDevLive = UgcManagementServiceLive.pipe(
  Layer.provide(Layer.merge(persistence, UgcSupportingServicesLive)),
)
