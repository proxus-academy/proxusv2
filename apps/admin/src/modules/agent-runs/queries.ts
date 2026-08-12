import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { AdminAgentRunsClient } from "./api.js"
import { agentRunsRuntime } from "./runtime.js"
export const runsAtom = agentRunsRuntime.atom(Effect.gen(function*() { return yield* (yield* AdminAgentRunsClient).listRuns({ query: { limit: 50 } }) }))
export const runDetailFamily = Atom.family((runId: string) => agentRunsRuntime.atom(Effect.gen(function*() { return yield* (yield* AdminAgentRunsClient).getRun({ params: { runId } }) })))
export const tracePayloadFamily = Atom.family((key: `${string}:${string}`) => agentRunsRuntime.atom(Effect.gen(function*() { const separator = key.indexOf(":"); const runId = key.slice(0, separator); const traceId = key.slice(separator + 1); return yield* (yield* AdminAgentRunsClient).getTracePayload({ params: { runId, traceId } }) })))
