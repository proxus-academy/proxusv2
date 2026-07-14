import { Layer } from "effect"
import { PgliteDevelopmentLive } from "../infrastructure/database/pglite.js"
import { StudyCatalogRepositoryPgliteLive } from "../modules/study-catalog/adapters/repository.pglite.layer.js"
import { StudyCatalogLive } from "../modules/study-catalog/service.live.js"

const RepositoryLive = StudyCatalogRepositoryPgliteLive.pipe(
  Layer.provide(PgliteDevelopmentLive),
)

export const StudyCatalogDevLive = StudyCatalogLive.pipe(
  Layer.provide(RepositoryLive),
)
