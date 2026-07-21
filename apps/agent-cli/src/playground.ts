// @effect-diagnostics nodeBuiltinImport:off strictEffectProvide:off anyUnknownInErrorContext:off
import { randomUUID } from "node:crypto"

import { OneTurnModel } from "@proxus/agent-harness/ai"
import { effectAiOneTurnModelLayer } from "@proxus/agent-harness/ai/effect-ai"
import { makeRunId } from "@proxus/agent-harness/ids"
import { RunEngine, runEngineLayer, type RunRecord } from "@proxus/agent-harness/run"
import { GeminiLanguageModelLive } from "@proxus/backend-infra/agent-harness/models/gemini"
import { pgliteAgentStoreLayer } from "@proxus/backend-infra/agent-harness/store/pglite"
import { Effect, Layer } from "effect"

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

const modelLayer = effectAiOneTurnModelLayer(disabledHandlers).pipe(
  Layer.provide(GeminiLanguageModelLive),
)

export interface PlaygroundRunOptions {
  readonly database: string
  readonly input: string
}

export const playgroundRun = (options: PlaygroundRunOptions): Effect.Effect<RunRecord, unknown> => {
  const store = pgliteAgentStoreLayer(options.database === ":memory:" ? undefined : options.database)
  const engine = runEngineLayer().pipe(Layer.provide(Layer.merge(store, modelLayer)))
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
): Effect.Effect<{ readonly answer: string; readonly context: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }> }, unknown> =>
  Effect.gen(function*() {
    const model = yield* OneTurnModel
    const result = yield* model.generate({ instructions, context })
    return { answer: result.text, context: [...context, { role: "assistant" as const, content: result.text }] }
  }).pipe(Effect.provide(modelLayer))
