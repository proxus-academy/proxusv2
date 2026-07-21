// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalErrorInEffectCatch:off processEnv:off preferSchemaOverJson:off strictEffectProvide:off
import { mkdirSync } from "node:fs"

import { inMemorySkillsLayer, Skill } from "@proxus/agent-harness/skills"
import { AgentStore } from "@proxus/agent-harness/store"
import { currentWorkspaceSandboxLayer } from "@proxus/backend-infra/agent-harness/sandbox/current"
import { temporarySandboxLayer } from "@proxus/backend-infra/agent-harness/sandbox/temporary"
import { consoleAgentTelemetryLayer } from "@proxus/backend-infra/agent-harness/observability/console"
import { pgliteAgentStoreLayer } from "@proxus/backend-infra/agent-harness/store/pglite"
import { Effect, Layer } from "effect"
import { deterministicRunId, engineeringScenario, type ScenarioReport } from "./scenario.js"

const descriptor = Skill.define({ id: "deterministic-engineering", description: "Follow the deterministic local engineering fixture" })
const skillLayer = inMemorySkillsLayer([descriptor], { "deterministic-engineering": { id: descriptor.id, description: descriptor.description, instructions: "Read evidence, delegate analysis, make the bounded change, then validate it.", references: [] } })
export interface RunOptions { readonly database: string; readonly workspace?: string; readonly write?: (line: string) => void }

const layers = (options: RunOptions) => {
  if (options.database !== ":memory:") mkdirSync(options.database, { recursive: true })
  return Layer.mergeAll(pgliteAgentStoreLayer(options.database === ":memory:" ? undefined : options.database), options.workspace !== undefined ? currentWorkspaceSandboxLayer(options.workspace) : temporarySandboxLayer, consoleAgentTelemetryLayer(options.write ?? console.log), skillLayer)
}

export const runDeterministicScenario = (options: RunOptions): Promise<ScenarioReport> => Effect.runPromise(engineeringScenario.pipe(Effect.provide(layers(options)), Effect.scoped))
export const reopenRun = (database: string) => Effect.runPromise(Effect.gen(function*() { const store = yield* AgentStore; return yield* store.getRun(deterministicRunId) }).pipe(Effect.provide(pgliteAgentStoreLayer(database === ":memory:" ? undefined : database)), Effect.scoped))
