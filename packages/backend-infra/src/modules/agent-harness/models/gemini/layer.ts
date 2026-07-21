import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

const GeminiConfig = Config.all({
  apiKey: Config.redacted("GOOGLE_GENERATIVE_AI_API_KEY"),
  model: Config.string("GOOGLE_GENERATIVE_AI_MODEL").pipe(Config.withDefault("gemini-2.5-flash")),
})

const googleOpenAiApiUrl = "https://generativelanguage.googleapis.com/v1beta/openai"

/**
 * Google Gemini through Google's OpenAI-compatible endpoint.
 * The API key remains Redacted and this host-side Layer is never provided to a sandbox.
 */
export const GeminiLanguageModelLive = Layer.unwrap(Effect.map(GeminiConfig, ({ apiKey, model }) => {
  const client = OpenAiClient.layer({ apiKey, apiUrl: googleOpenAiApiUrl }).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
  return OpenAiLanguageModel.layer({ model }).pipe(Layer.provide(client))
}))
