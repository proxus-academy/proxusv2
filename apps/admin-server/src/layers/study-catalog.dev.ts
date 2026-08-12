import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { AgentTraceStoreSqlLive } from "@proxus/backend-infra/agent-harness/store/sql"
import { AgentInspectorSqlLive } from "@proxus/backend-infra/agent-harness/observability/inspector"
import { filesystemArtifactStoreLayer } from "@proxus/backend-infra/agent-harness/artifacts/filesystem"
import { Config, Layer } from "effect"

const ArtifactLive = Layer.unwrap(Config.string("AGENT_ARTIFACTS_DIR").pipe(Config.withDefault(".proxus/agent-runs-artifacts"), Config.map(filesystemArtifactStoreLayer)))
const SqlServices = Layer.merge(StudyCatalogRepositoryPgliteLive, AgentTraceStoreSqlLive)
const ApplicationServices = Layer.merge(
  StudyCatalogLive.pipe(Layer.provide(SqlServices)),
  AgentInspectorSqlLive.pipe(Layer.provide(Layer.merge(SqlServices, ArtifactLive))),
)
export const StudyCatalogDevLive = ApplicationServices.pipe(
  Layer.provideMerge(PgliteMigrationLive),
  Layer.provide(PgliteDevelopmentLive),
)
