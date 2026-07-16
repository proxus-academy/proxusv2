import { Layer } from "effect"
import {
  PostgresMigrationCheckLive,
  makePostgresProductionLive,
} from "@proxus/backend-infra/database/postgres"
import { StudyCatalogRepositoryPostgresLive } from "@proxus/backend-infra/study-catalog/postgres"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"

const PostgresProductionLive = makePostgresProductionLive("proxus-server")

const PersistenceLive = Layer.merge(
  PostgresMigrationCheckLive,
  StudyCatalogRepositoryPostgresLive,
).pipe(Layer.provide(PostgresProductionLive))

export const StudyCatalogProdLive = StudyCatalogLive.pipe(
  Layer.provide(PersistenceLive),
)
