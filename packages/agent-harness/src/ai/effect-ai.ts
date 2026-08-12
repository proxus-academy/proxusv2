/* Effect AI beta imports are deliberately localized to this module. */
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import { OneTurnModel, ModelTurnFailure, type HarnessToolHandlers, type ModelTurnInput, type ModelTurnResult, type ModelTurnStreamEvent } from "./model-turn.js"

export const LoadSkillTool = Tool.make("loadSkill", {
  description: "Load the instructions for one skill permitted by the current agent. Skills teach; they do not grant authority.",
  parameters: Schema.Struct({ name: Schema.NonEmptyString }),
  success: Schema.String,
})
export const ExecuteDslTool = Tool.make("executeDsl", {
  description: "Compile, authorize, and execute one single-line expression in the current agent's fixed DSL.",
  parameters: Schema.Struct({ source: Schema.NonEmptyString }),
  success: Schema.String,
})
export const HarnessToolkit = Toolkit.make(LoadSkillTool, ExecuteDslTool)

export const harnessToolkitLayer = (handlers: HarnessToolHandlers) => HarnessToolkit.toLayer({
  loadSkill: ({ name }) => handlers.loadSkill(name),
  executeDsl: ({ source }) => handlers.executeDsl(source),
})

const promptText = (input: ModelTurnInput): string => [
  input.instructions,
  ...input.context.map((message) => `${message.role.toUpperCase()}: ${message.content}`),
].join("\n\n")

/** Adapts beta.98 LanguageModel to the stable, application-owned one-turn contract. */
export const effectAiOneTurnModelLayer = (handlers: HarnessToolHandlers): Layer.Layer<OneTurnModel, never, LanguageModel.LanguageModel> => {
  const modelLayer = Layer.effect(OneTurnModel, Effect.gen(function*() {
    const model = yield* LanguageModel.LanguageModel
    const generate = (input: ModelTurnInput) => model.generateText({ prompt: promptText(input), toolkit: HarnessToolkit }).pipe(
        Effect.map((response) => {
          const calls = response.toolCalls.map((call: any) => {
            const result = response.toolResults.find((item: any) => item.id === call.id || item.toolCallId === call.id)
            return { name: call.name, input: call.params ?? call.input ?? {}, result: String((result as any)?.result ?? "") }
          })
          return {
            text: response.text,
            finishReason: response.finishReason,
            toolCalls: calls,
            usage: {
              inputTokens: response.usage.inputTokens.total,
              outputTokens: response.usage.outputTokens.total,
            },
          }
        }),
        Effect.mapError((cause) => new ModelTurnFailure({ message: "Effect AI model turn failed", cause })),
      ) as any
    const stream = (input: ModelTurnInput) => {
      let text = ""
      const toolCalls: Array<ModelTurnResult["toolCalls"][number]> = []
      return model.streamText({ prompt: promptText(input), toolkit: HarnessToolkit }).pipe(
        Stream.map((part: any): ModelTurnStreamEvent | undefined => {
          if (part.type === "text-delta") {
            text += part.delta
            return { _tag: "TextDelta", delta: part.delta }
          }
          if (part.type === "tool-result") {
            toolCalls.push({ name: part.name, input: part.params ?? part.input ?? {}, result: String(part.result ?? "") })
            return undefined
          }
          if (part.type === "finish") return {
            _tag: "Completed",
            result: {
              text,
              finishReason: part.reason,
              toolCalls,
              usage: {
                inputTokens: part.usage.inputTokens.total,
                outputTokens: part.usage.outputTokens.total,
              },
            },
          }
          return undefined
        }),
        Stream.filter((event): event is ModelTurnStreamEvent => event !== undefined),
        Stream.mapError((cause) => new ModelTurnFailure({ message: "Effect AI streaming model turn failed", cause })),
      ) as any
    }
    return OneTurnModel.of({ generate, stream })
  }))
  return Layer.provide(modelLayer, harnessToolkitLayer(handlers))
}
