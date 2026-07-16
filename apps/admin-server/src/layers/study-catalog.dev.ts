import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { Layer } from "effect"

const PersistenceLive = Layer.merge(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
).pipe(Layer.provide(PgliteDevelopmentLive))

export const StudyCatalogDevLive = StudyCatalogLive.pipe(Layer.provide(PersistenceLive))
