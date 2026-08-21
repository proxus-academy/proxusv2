import { Effect, Layer, Stream } from "effect"
import { ConversationGeneration } from "./generation.js"

export const ConversationGenerationDeterministic = Layer.succeed(
  ConversationGeneration,
  ConversationGeneration.of({
    provider: "deterministic",
    model: "proxus-test-v1",
    generate: (messages) => {
      const last = messages.at(-1)?.content ?? ""
      const response = `Respuesta de desarrollo: ${last}`
      return Stream.fromIterable([
        { _tag: "TextDelta" as const, delta: response },
        { _tag: "Usage" as const, inputTokens: last.length, outputTokens: response.length, cachedInputTokens: 0 },
        { _tag: "Finished" as const, reason: "stop" },
      ])
    },
  }),
)
