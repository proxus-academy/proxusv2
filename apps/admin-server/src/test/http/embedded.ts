import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { makeRunId } from "@proxus/agent-harness/ids"
import { AgentInspector, AgentInspectorFailure, type AgentRunInspection } from "@proxus/agent-harness/observability"
import { PgliteLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { AdminApi } from "@proxus/shared/admin-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { AdminApiRoutes } from "../../http.js"

const PersistenceLive = Layer.merge(PgliteMigrationLive, StudyCatalogRepositoryPgliteLive).pipe(
  Layer.provide(PgliteLive()),
)
export const agentRunFixture = {
  runId: makeRunId("11111111-1111-4111-8111-111111111111"),
  missingRunId: makeRunId("99999999-9999-4999-8999-999999999999"),
  traceId: "trace-fixture-1",
  payloadBytes: new Uint8Array([0, 255, 16, 128]),
} as const

const limits = { maxTurns: 8, maxDslExecutions: 7, maxOperations: 6, maxInputTokens: 5_000, maxOutputTokens: 2_000, maxOutputBytes: 10_000, deadlineMs: 60_000, maxChildren: 2 }
const usage = { turns: 2, dslExecutions: 1, operations: 3, inputTokens: 120, outputTokens: 45, outputBytes: 512 }
const run = { runId: agentRunFixture.runId, status: "Succeeded" as const, startedAt: 1_700_000_000_000, turns: usage.turns, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
const trace = {
  traceId: agentRunFixture.traceId, spanId: "span-fixture-1", runId: agentRunFixture.runId, turn: 2,
  provider: "fixture-provider", model: "fixture-model", status: "succeeded" as const, captureStatus: "stored" as const,
  startedAt: 1_700_000_000_100, completedAt: 1_700_000_000_250, durationMs: 150, inputTokens: 120, outputTokens: 45,
  payloadSha256: "fixture-sha256", payloadBytes: agentRunFixture.payloadBytes.byteLength, contentType: "application/json", contentEncoding: "gzip" as const,
  schemaVersion: 1, redactionVersion: 1,
}
const inspection: AgentRunInspection = {
  run, limits, usage,
  events: [{ sequence: 1, type: "RunStarted", at: 1_700_000_000_000 }, { sequence: 2, type: "TurnCompleted", at: 1_700_000_000_200, turn: 2 }],
  traces: [trace],
}

/** Deterministic transport fixture: no database, artifact store, or collector is contacted. */
export const TestInspectorLive = Layer.succeed(AgentInspector, AgentInspector.of({
  listRuns: (limit, before) => Effect.succeed((before === undefined || run.startedAt < before ? [run] : []).slice(0, limit)),
  inspectRun: (runId) => runId === agentRunFixture.runId
    ? Effect.succeed(inspection)
    : Effect.fail(new AgentInspectorFailure({ reason: "not-found" })),
  payload: (runId, traceId) => runId === agentRunFixture.runId && traceId === agentRunFixture.traceId
    ? Effect.succeed({ contentType: "application/json", contentEncoding: "gzip", bytes: agentRunFixture.payloadBytes })
    : Effect.fail(new AgentInspectorFailure({ reason: "payload-unavailable" })),
}))
const RoutesLive = AdminApiRoutes.pipe(
  Layer.provide(Layer.merge(StudyCatalogLive.pipe(Layer.provide(PersistenceLive)), TestInspectorLive)),
  Layer.provide(HttpServer.layerServices),
)
export const makeEmbeddedAdminWeb = Effect.acquireRelease(
  Effect.sync(() => HttpRouter.toWebHandler(RoutesLive, { disableLogger: true })),
  (web) => Effect.promise(() => web.dispose()),
)
export const makeEmbeddedAdminClient = Effect.gen(function*() {
  const web = yield* makeEmbeddedAdminWeb
  const fetch = Object.assign(
    (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => web.handler(new Request(input, init)),
    { preconnect: () => undefined },
  ) satisfies typeof globalThis.fetch
  const context = yield* Layer.build(FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  ))
  return yield* HttpApiClient.make(AdminApi, { baseUrl: "http://proxus.test" }).pipe(Effect.provide(context))
})
