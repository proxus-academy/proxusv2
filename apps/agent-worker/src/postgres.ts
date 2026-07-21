import { Layer } from "effect"
import { makePostgresProductionLive, PostgresMigrationCheckLive } from "@proxus/backend-infra/database/postgres"
import { PostgresAgentStoreLive } from "@proxus/backend-infra/agent-harness/store/postgres"
import { agentOtlpLayer, type AgentOtlpConfig } from "@proxus/backend-infra/agent-harness/observability/otlp"
import type { WorkerProcessor } from "./app.js"
import { composeWorker, type WorkerOptions } from "./app.js"

/** One pool Layer value is shared by migration policy, store and coordinator. */
export const makePostgresWorkerLayer = (options: WorkerOptions, processor: Layer.Layer<WorkerProcessor>) => {
  const postgres = makePostgresProductionLive("proxus-agent-worker")
  const migrationCheck = PostgresMigrationCheckLive.pipe(Layer.provide(postgres))
  const store = PostgresAgentStoreLive.pipe(Layer.provide(postgres))
  return Layer.merge(composeWorker(options, store, processor), migrationCheck)
}

/** Product composition: one outer scoped OTLP provider owns batching and shutdown flush. */
export const makeObservedPostgresWorkerLayer = (options: WorkerOptions, processor: Layer.Layer<WorkerProcessor>, telemetry: AgentOtlpConfig) => Layer.merge(makePostgresWorkerLayer(options, processor), agentOtlpLayer(telemetry))
