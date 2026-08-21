import { Context, Schema, Stream } from "effect"

export const GenerationMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  content: Schema.String,
})
export type GenerationMessage = typeof GenerationMessage.Type

export const GenerationEvent = Schema.Union([
  Schema.TaggedStruct("TextDelta", { delta: Schema.String }),
  Schema.TaggedStruct("Usage", {
    inputTokens: Schema.Number,
    outputTokens: Schema.Number,
    cachedInputTokens: Schema.Number,
  }),
  Schema.TaggedStruct("Finished", { reason: Schema.String }),
])
export type GenerationEvent = typeof GenerationEvent.Type

export class ConversationGenerationError extends Schema.TaggedErrorClass<ConversationGenerationError>()(
  "ConversationGenerationError",
  { code: Schema.String, cause: Schema.Defect() },
) {}

export class ConversationGeneration extends Context.Service<ConversationGeneration, {
  readonly provider: string
  readonly model: string
  readonly generate: (messages: ReadonlyArray<GenerationMessage>) => Stream.Stream<GenerationEvent, ConversationGenerationError>
}>()("@proxus/backend-domain/modules/conversations/generation/ConversationGeneration") {}
