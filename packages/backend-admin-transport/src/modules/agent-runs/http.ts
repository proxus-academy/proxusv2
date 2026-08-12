import { AgentInspector, type AgentInspectorFailure } from "@proxus/agent-harness/observability"
import { makeRunId } from "@proxus/agent-harness/ids"
import { AdminApi } from "@proxus/shared/admin-api"
import { Effect, Encoding } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const safeRead = <A, R>(effect: Effect.Effect<A, AgentInspectorFailure, R>) => effect.pipe(Effect.mapError((error): HttpApiError.NotFound | HttpApiError.InternalServerError =>
  error.reason === "not-found" || error.reason === "payload-unavailable" ? new HttpApiError.NotFound({}) : new HttpApiError.InternalServerError({}),
))
const safeList = <A, R>(effect: Effect.Effect<A, AgentInspectorFailure, R>) => effect.pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))

/** Temporarily unauthenticated, like the rest of admin. Never expose this server publicly. */
export const AdminAgentRunsHandlers = HttpApiBuilder.group(AdminApi, "adminAgentRuns", Effect.fn(function* (handlers) {
  const inspector = yield* AgentInspector
  return handlers
    .handle("listRuns", ({ query }) => safeList(query.before === undefined ? inspector.listRuns(query.limit ?? 50) : inspector.listRuns(query.limit ?? 50, query.before)))
    .handle("getRun", ({ params }) => safeRead(inspector.inspectRun(makeRunId(params.runId))))
    .handle("listTraces", ({ params }) => safeRead(inspector.inspectRun(makeRunId(params.runId))).pipe(Effect.map((detail) => detail.traces)))
    .handle("getTracePayload", ({ params }) => safeRead(inspector.payload(makeRunId(params.runId), params.traceId)).pipe(Effect.map((payload) => ({ contentType: payload.contentType, ...(payload.contentEncoding === undefined ? {} : { contentEncoding: payload.contentEncoding }), bytesBase64: Encoding.encodeBase64(payload.bytes) }))))
}))
