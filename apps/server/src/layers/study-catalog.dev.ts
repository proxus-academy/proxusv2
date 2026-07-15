import { Layer } from "effect"
import {
  PgliteDevelopmentLive,
  PgliteMigrationLive,
} from "../infrastructure/database/pglite.js"
import { StudyCatalogRepositoryPgliteLive } from "../modules/study-catalog/adapters/repository.pglite.layer.js"
import { StudyCatalogLive } from "../modules/study-catalog/service.live.js"

const PersistenceLive = Layer.merge(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
).pipe(Layer.provide(PgliteDevelopmentLive))

export const StudyCatalogDevLive = StudyCatalogLive.pipe(
  Layer.provide(PersistenceLive),
)
