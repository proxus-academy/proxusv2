import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { StudyCatalogRepositoryPostgresLive } from "@proxus/backend-infra/study-catalog/postgres"
import { AgentTraceStoreSqlLive } from "@proxus/backend-infra/agent-harness/store/sql"
import { AgentInspectorSqlLive } from "@proxus/backend-infra/agent-harness/observability/inspector"
import { filesystemArtifactStoreLayer } from "@proxus/backend-infra/agent-harness/artifacts/filesystem"
import { Config, Layer } from "effect"

const ArtifactLive = Layer.unwrap(Config.string("AGENT_ARTIFACTS_DIR").pipe(Config.map(filesystemArtifactStoreLayer)))
const PostgresProductionLive = makePostgresProductionLive("proxus-admin-server")
const SqlServices = Layer.merge(StudyCatalogRepositoryPostgresLive, AgentTraceStoreSqlLive)
const ApplicationServices = Layer.merge(
  StudyCatalogLive.pipe(Layer.provide(SqlServices)),
  AgentInspectorSqlLive.pipe(Layer.provide(Layer.merge(SqlServices, ArtifactLive))),
)
export const StudyCatalogProdLive = ApplicationServices.pipe(
  Layer.provideMerge(PostgresMigrationCheckLive),
  Layer.provide(PostgresProductionLive),
)
