import { ConversationGeneration, ConversationGenerationError, type GenerationEvent, type GenerationMessage } from "@proxus/backend-domain/conversations"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { NodeHttpClient } from "@effect/platform-node"
import { Config, Effect, Layer, Stream } from "effect"
import { LanguageModel, type Response } from "effect/unstable/ai"

const toPrompt = (messages: ReadonlyArray<GenerationMessage>) => [
  { role: "system" as const, content: "You are a helpful assistant. Be accurate, concise, and explicit about uncertainty." },
  ...messages,
]

const toEvents = (part: Response.TextDeltaPart | Response.FinishPart): ReadonlyArray<GenerationEvent> => {
  if (part.type === "text-delta") return [{ _tag: "TextDelta", delta: part.delta }]
  return [
    {
      _tag: "Usage",
      inputTokens: part.usage.inputTokens.total ?? 0,
      outputTokens: part.usage.outputTokens.total ?? 0,
      cachedInputTokens: part.usage.inputTokens.cacheRead ?? 0,
    },
    { _tag: "Finished", reason: part.reason },
  ]
}

export const ConversationGenerationOpenAiLive = Layer.unwrap(
  Effect.all({
    apiKey: Config.redacted("OPENAI_API_KEY"),
    model: Config.string("AI_MODEL").pipe(Config.withDefault("gpt-5-mini")),
  }).pipe(Effect.map(({ apiKey, model }) => {
    const ModelLive = OpenAiLanguageModel.model(model).pipe(
      Layer.provide(OpenAiClient.layer({ apiKey })),
      Layer.provide(NodeHttpClient.layerUndici),
    )
    return Layer.succeed(ConversationGeneration, ConversationGeneration.of({
      provider: "openai",
      model,
      generate: (messages) => LanguageModel.streamText({ prompt: toPrompt(messages) }).pipe(
        Stream.filter((part) => part.type === "text-delta" || part.type === "finish"),
        Stream.flatMap((part) => Stream.fromIterable(toEvents(part))),
        Stream.mapError((cause) => new ConversationGenerationError({ code: "openai_generation_failed", cause })),
        Stream.provide(ModelLive),
      ),
    }))
  })),
)
