import { Layer } from "effect"
import {
  PostgresMigrationCheckLive,
  PostgresProductionLive,
} from "../infrastructure/database/postgres.js"
import { StudyCatalogRepositoryPostgresLive } from "../modules/study-catalog/adapters/repository.postgres.layer.js"
import { StudyCatalogLive } from "../modules/study-catalog/service.live.js"

const PersistenceLive = Layer.merge(
  PostgresMigrationCheckLive,
  StudyCatalogRepositoryPostgresLive,
).pipe(Layer.provide(PostgresProductionLive))

export const StudyCatalogProdLive = StudyCatalogLive.pipe(
  Layer.provide(PersistenceLive),
)
