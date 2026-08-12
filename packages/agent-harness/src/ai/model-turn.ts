import { Context, Data, Effect, Layer, Stream } from "effect"

export interface ModelTurnInput {
  readonly instructions: string
  readonly context: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }>
  readonly invocation?: { readonly runId: import("../ids.js").RunId; readonly turn: number }
}
export interface ModelTurnResult {
  readonly text: string
  readonly finishReason: string
  readonly toolCalls: ReadonlyArray<{ readonly name: "loadSkill" | "executeDsl"; readonly input: Readonly<Record<string, unknown>>; readonly result: string }>
  readonly usage: { readonly inputTokens?: number; readonly outputTokens?: number }
}
export class ModelTurnFailure extends Data.TaggedError("ModelTurnFailure")<{ readonly message: string; readonly cause?: unknown }> {}
export type ModelTurnStreamEvent =
  | { readonly _tag: "TextDelta"; readonly delta: string }
  | { readonly _tag: "Completed"; readonly result: ModelTurnResult }

/** Application-owned one-provider-turn boundary. It intentionally exposes no Effect AI types. */
export class OneTurnModel extends Context.Service<OneTurnModel, {
  readonly generate: (input: ModelTurnInput) => Effect.Effect<ModelTurnResult, ModelTurnFailure>
  readonly stream: (input: ModelTurnInput) => Stream.Stream<ModelTurnStreamEvent, ModelTurnFailure>
}>()("@proxus/agent-harness/ai/model-turn/OneTurnModel") {}

export type ScriptedToolCall =
  | { readonly name: "loadSkill"; readonly input: { readonly name: string } }
  | { readonly name: "executeDsl"; readonly input: { readonly source: string } }
export type ScriptedTurn =
  | { readonly _tag: "Success"; readonly text: string; readonly toolCalls?: ReadonlyArray<ScriptedToolCall>; readonly finishReason?: string; readonly usage?: ModelTurnResult["usage"] }
  | { readonly _tag: "Failure"; readonly message: string }

export interface HarnessToolHandlers {
  readonly loadSkill: (name: string) => Effect.Effect<string>
  readonly executeDsl: (source: string) => Effect.Effect<string>
}

/** Deterministic FIFO model. Calls use the same harness handlers as the Effect AI toolkit. */
export const scriptedModelLayer = (script: ReadonlyArray<ScriptedTurn>, handlers: HarnessToolHandlers): Layer.Layer<OneTurnModel> => {
  let cursor = 0
  const generate = (_input: ModelTurnInput) => Effect.gen(function*() {
      const turn = script[cursor++]
      if (turn === undefined) return yield* new ModelTurnFailure({ message: `Script exhausted at turn ${cursor}` })
      if (turn._tag === "Failure") return yield* new ModelTurnFailure({ message: turn.message })
      const calls: Array<ModelTurnResult["toolCalls"][number]> = []
      for (const call of turn.toolCalls ?? []) {
        const result = call.name === "loadSkill"
          ? yield* handlers.loadSkill(call.input.name)
          : yield* handlers.executeDsl(call.input.source)
        calls.push({ name: call.name, input: call.input, result })
      }
      return { text: turn.text, finishReason: turn.finishReason ?? "stop", toolCalls: calls, usage: turn.usage ?? {} }
    }).pipe(Effect.mapError((cause) => cause instanceof ModelTurnFailure ? cause : new ModelTurnFailure({ message: "Scripted tool call failed", cause })))
  return Layer.succeed(OneTurnModel, OneTurnModel.of({
    generate,
    stream: (input) => Stream.unwrap(generate(input).pipe(Effect.map((result) => Stream.fromIterable<ModelTurnStreamEvent>([
      ...(result.text.length === 0 ? [] : [{ _tag: "TextDelta" as const, delta: result.text }]),
      { _tag: "Completed" as const, result },
    ])))),
  }))
}
