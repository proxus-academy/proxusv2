import { Layer } from "effect"
import {
  PgliteDevelopmentLive,
  PgliteMigrationLive,
} from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"

const PersistenceLive = Layer.merge(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
).pipe(Layer.provide(PgliteDevelopmentLive))

export const StudyCatalogDevLive = StudyCatalogLive.pipe(
  Layer.provide(PersistenceLive),
)
