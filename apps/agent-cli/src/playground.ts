// @effect-diagnostics nodeBuiltinImport:off strictEffectProvide:off anyUnknownInErrorContext:off
import { randomUUID } from "node:crypto"

import { ModelTurnFailure, OneTurnModel } from "@proxus/agent-harness/ai"
import { effectAiOneTurnModelLayer } from "@proxus/agent-harness/ai/effect-ai"
import { makeRunId } from "@proxus/agent-harness/ids"
import { RunEngine, runEngineLayer, type RunRecord } from "@proxus/agent-harness/run"
import { GeminiLanguageModelLive } from "@proxus/backend-infra/agent-harness/models/gemini"
import { filesystemArtifactStoreLayer } from "@proxus/backend-infra/agent-harness/artifacts/filesystem"
import { technicalTraceModelLayer } from "@proxus/backend-infra/agent-harness/observability/trace-payload"
import { pgliteAgentStoresLayer } from "@proxus/backend-infra/agent-harness/store/pglite"
import { Effect, Layer, Stream } from "effect"

const instructions = [
  "You are the Proxus internal agent playground.",
  "Answer the user's request clearly and concisely.",
  "This initial playground has no skills, DSL operations, filesystem, network tools, or delegated agents.",
  "Do not call tools. If the request needs a capability, explain that it has not been enabled.",
].join(" ")

const disabledHandlers = {
  loadSkill: (name: string) => Effect.succeed(`Skill '${name}' is not enabled in the playground.`),
  executeDsl: (_source: string) => Effect.succeed("DSL execution is not enabled in the playground."),
}

const baseModelLayer = effectAiOneTurnModelLayer(disabledHandlers).pipe(
  Layer.provide(GeminiLanguageModelLive),
)

export interface PlaygroundRunOptions {
  readonly database: string
  readonly input: string
  readonly onTextDelta?: (delta: string) => void
}

export const playgroundRun = (options: PlaygroundRunOptions): Effect.Effect<RunRecord, unknown> => {
  const store = pgliteAgentStoresLayer(options.database === ":memory:" ? undefined : options.database)
  const artifacts = filesystemArtifactStoreLayer(options.database === ":memory:" ? ".proxus/agent-traces" : `${options.database}-artifacts`)
  const tracedModel = technicalTraceModelLayer({ provider: "google", model: "gemini-2.5-flash", tenantId: "local" }).pipe(
    Layer.provide(Layer.mergeAll(baseModelLayer, store, artifacts)),
  )
  const engine = runEngineLayer(undefined, (event) => Effect.sync(() => {
    if (event._tag === "TextDelta") options.onTextDelta?.(event.delta)
  })).pipe(Layer.provide(Layer.merge(store, tracedModel)))
  return Effect.gen(function*() {
    const service = yield* RunEngine
    return yield* service.start({
      runId: makeRunId(randomUUID()),
      instructions,
      input: options.input,
      limits: {
        maxTurns: 4,
        maxDslExecutions: 0,
        maxOperations: 2,
        maxInputTokens: 32_000,
        maxOutputTokens: 8_000,
        maxOutputBytes: 64_000,
        deadlineMs: 120_000,
        maxChildren: 0,
      },
    })
  }).pipe(Effect.provide(engine), Effect.scoped)
}

export const playgroundChatTurn = (
  context: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }>,
  onTextDelta: (delta: string) => void = () => undefined,
): Effect.Effect<{ readonly answer: string; readonly context: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }> }, unknown> =>
  Effect.gen(function*() {
    const model = yield* OneTurnModel
    let answer: string | undefined
    yield* model.stream({ instructions, context }).pipe(Stream.runForEach((event) => Effect.sync(() => {
      if (event._tag === "TextDelta") onTextDelta(event.delta)
      else answer = event.result.text
    })))
    if (answer === undefined) return yield* new ModelTurnFailure({ message: "Model stream ended without completion" })
    return { answer, context: [...context, { role: "assistant" as const, content: answer }] }
  }).pipe(Effect.provide(baseModelLayer))
