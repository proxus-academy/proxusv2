import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { StudyCatalogRepositoryPostgresLive } from "@proxus/backend-infra/study-catalog/postgres"
import { Layer } from "effect"

const PostgresProductionLive = makePostgresProductionLive("proxus-admin-server")
const PersistenceLive = Layer.merge(
  PostgresMigrationCheckLive,
  StudyCatalogRepositoryPostgresLive,
).pipe(Layer.provide(PostgresProductionLive))

export const StudyCatalogProdLive = StudyCatalogLive.pipe(Layer.provide(PersistenceLive))
