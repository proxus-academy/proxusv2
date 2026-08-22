import { UgcManagementServiceLive } from "@proxus/backend-domain/ugc-management"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { UgcRepositoryPostgresLive } from "@proxus/backend-infra/ugc-management/postgres"
import { UgcSupportingServicesLive } from "@proxus/backend-infra/ugc-management/services"
import { Layer } from "effect"

const database = makePostgresProductionLive("proxus-server-ugc")
const persistence = Layer.merge(PostgresMigrationCheckLive, UgcRepositoryPostgresLive).pipe(Layer.provide(database))

export const UgcProdLive = UgcManagementServiceLive.pipe(
  Layer.provide(Layer.merge(persistence, UgcSupportingServicesLive)),
)
