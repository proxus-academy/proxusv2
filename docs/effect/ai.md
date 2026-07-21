# Effect AI

> **Version:** Effect v4 beta. This repository pins `effect@4.0.0-beta.98`; the source snapshot used here is `4.0.0-beta.98` (`3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec`). Pin compatible provider packages and re-check signatures on every beta upgrade.
>
> **API status:** `effect/unstable/ai` and `effect/unstable/http` are **unstable**. Provider packages such as `@effect/ai-openai` and `@effect/ai-anthropic` integrate with those unstable interfaces. Localize them behind an application-owned module.

An AI model is an unreliable external dependency, not a domain authority. The application module owns prompts, model policy, schema validation, budgets, retries, tool authorization, error translation, and observability. Callers should see a small domain interface rather than provider request/response types.

## Installation and provider configuration

Keep the repository's exact `effect@4.0.0-beta.98` pin. Add provider packages only at exact versions proven compatible with that beta; never use a floating `@beta` range. Record those versions in this guide when AI is adopted.

Use typed, service-local configuration and redact secrets:

```ts
import { OpenAiClient } from "@effect/ai-openai"
import { Config, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http" // UNSTABLE

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))
```

An API key required by an enabled provider has no default and must fail layer initialization when absent or invalid. Keep model IDs, endpoints, and limits beside the owning AI module. Use `Config.option` only when “provider disabled” is an intentional state; do not silently fall back to a mock.

## A complete domain module

This pattern covers plain text, schema-decoded objects, streaming, provider fallback, and domain error translation.

```ts
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import {
  Config, Context, Effect, ExecutionPlan, Layer, Schema, Stream
} from "effect"
import {
  AiError, LanguageModel, Model, type Response
} from "effect/unstable/ai" // UNSTABLE
import { FetchHttpClient } from "effect/unstable/http" // UNSTABLE

class LaunchPlan extends Schema.Class<LaunchPlan>("app/LaunchPlan")({
  audience: Schema.String,
  channels: Schema.Array(Schema.String),
  launchDate: Schema.String,
  summary: Schema.String,
  keyRisks: Schema.Array(Schema.String)
}) {}

class WriterError extends Schema.TaggedErrorClass<WriterError>()("WriterError", {
  reason: AiError.AiErrorReason
}) {
  static fromAi(error: AiError.AiError) {
    return new WriterError({ reason: error.reason })
  }
}

const OpenAiLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

const AnthropicLayer = AnthropicClient.layerConfig({
  apiKey: Config.redacted("ANTHROPIC_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

const DraftPlan = ExecutionPlan.make(
  { provide: OpenAiLanguageModel.model("gpt-5.2"), attempts: 3 },
  { provide: AnthropicLanguageModel.model("claude-opus-4-6"), attempts: 2 }
)

class Writer extends Context.Service<Writer, {
  draft(product: string): Effect.Effect<
    { readonly provider: string; readonly text: string },
    WriterError
  >
  extract(notes: string): Effect.Effect<LaunchPlan, WriterError>
  highlights(version: string): Stream.Stream<string, WriterError>
}>()("app/Writer") {
  static readonly layer = Layer.effect(
    Writer,
    Effect.gen(function*() {
      const draftModel = yield* DraftPlan.withRequirements
      const objectModel = yield* OpenAiLanguageModel
        .model("gpt-4.1")
        .withRequirements

      const draft = Effect.fn("Writer.draft")(
        function*(product: string) {
          const model = yield* LanguageModel.LanguageModel
          const provider = yield* Model.ProviderName
          const response = yield* model.generateText({
            prompt: `Write a concise launch announcement for ${product}.`
          })
          yield* Effect.logInfo("AI generation completed").pipe(
            Effect.annotateLogs({
              provider,
              finishReason: response.finishReason,
              outputTokens: response.usage.outputTokens.total
            })
          )
          return { provider, text: response.text }
        },
        Effect.withExecutionPlan(draftModel),
        Effect.mapError(WriterError.fromAi)
      )

      const extract = Effect.fn("Writer.extract")(
        function*(notes: string) {
          const response = yield* LanguageModel.generateObject({
            objectName: "launch_plan",
            prompt: `Convert these notes into a launch plan:\n${notes}`,
            schema: LaunchPlan
          })
          return response.value
        },
        Effect.provide(objectModel),
        Effect.mapError(WriterError.fromAi)
      )

      const highlights = (version: string) =>
        LanguageModel.streamText({
          prompt: `Write concise release highlights for ${version}.`
        }).pipe(
          Stream.filter(
            (part): part is Response.TextDeltaPart => part.type === "text-delta"
          ),
          Stream.map((part) => part.delta),
          Stream.provide(objectModel),
          Stream.mapError(WriterError.fromAi)
        )

      return Writer.of({ draft, extract, highlights })
    })
  ).pipe(Layer.provide([OpenAiLayer, AnthropicLayer]))
}
```

`generateText` exposes text, finish reason, usage, tool calls, and tool results. `generateObject` validates and decodes provider output with a `Schema`; invalid output is a typed failure, never trusted domain data. `streamText` emits response parts, so filter the variants you intend to expose rather than assuming every part is text.

`ExecutionPlan` can retry and fall back across supplied model layers. In the installed beta, `withRequirements` moves provider requirements into the surrounding layer. Attempts must be budgeted: retries can multiply latency, cost, and side effects.

## Typed tools

Tool parameters and success values are schemas. Descriptions are security- and quality-relevant model instructions, not validation substitutes.

```ts
import { Effect, Schema } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai" // UNSTABLE

const ProductId = Schema.String.pipe(Schema.brand("ProductId"))

const SearchProducts = Tool.make("SearchProducts", {
  description: "Search the product catalog by keyword",
  parameters: Schema.Struct({
    query: Schema.String.annotate({ description: "Catalog search text" }),
    maxResults: Schema.Number.pipe(
      Schema.withDecodingDefault(Effect.succeed(10))
    )
  }),
  success: Schema.Array(Schema.Struct({
    id: ProductId,
    name: Schema.String,
    price: Schema.Number
  })),
  failureMode: "error"
})

const GetInventory = Tool.make("GetInventory", {
  description: "Read stock for one authorized product",
  parameters: Schema.Struct({ productId: ProductId }),
  success: Schema.Struct({ productId: ProductId, available: Schema.Number })
})

const ProductTools = Toolkit.make(SearchProducts, GetInventory)

const ProductToolsLive = ProductTools.toLayer(Effect.gen(function*() {
  const catalog = yield* Catalog // application module; enforces scope/policy
  return ProductTools.of({
    SearchProducts: Effect.fn("ProductTools.SearchProducts")(
      ({ query, maxResults }) => catalog.search(query, maxResults)
    ),
    GetInventory: Effect.fn("ProductTools.GetInventory")(
      ({ productId }) => catalog.inventory(productId)
    )
  })
}))

const answer = Effect.gen(function*() {
  const toolkit = yield* ProductTools
  const response = yield* LanguageModel.generateText({
    prompt: "Find an in-stock keyboard",
    toolkit,
    toolChoice: "required" // default is "auto"
  })
  return {
    text: response.text,
    calls: response.toolCalls,
    results: response.toolResults
  }
})
```

`failureMode: "error"` (default) fails generation when a handler fails. `"return"` sends the failure back as a tool result. Choose deliberately: returned failure details become model-visible and may later become user-visible. Provider-defined tools run provider-side and do not appear in the local handler layer; they require separate data-governance approval.

## Stateful chat and bounded agent loops

```ts
import { Effect, Ref } from "effect"
import { Chat, Prompt } from "effect/unstable/ai" // UNSTABLE

const session = yield* Chat.fromPrompt(
  Prompt.empty.pipe(Prompt.setSystem("You are a support assistant."))
)

const response = yield* session.generateText({ prompt: userMessage }).pipe(
  Effect.provide(modelLayer)
)
const history = yield* Ref.get(session.history)
const exported = yield* session.exportJson
const restored = yield* Chat.fromJson(exported)
```

A `Chat` mutates its history across turns. Therefore one session must not be accidentally shared between users or requests. Exported JSON is sensitive persisted conversation data; validate with `Chat.fromJson`, encrypt where required, scope by account/user, apply retention, and never accept a client-supplied transcript as trusted system context.

The source example demonstrates a `while (true)` agent loop that continues while tools are called. Production code must add maximum turns, total tool calls, deadline, cancellation, token/cost budget, repeated-call detection, and an explicit exhausted-budget error. Tool execution can cause side effects; do not blindly retry or replay non-idempotent calls.

## Lifecycle and concurrency

- Build HTTP clients, provider clients, model policy, and tool handlers as layers; initialize them once per runtime where safe.
- Create chat state per conversation and end its lifecycle with that conversation.
- Consume streams inside the caller's scope; cancellation must stop the upstream request.
- Apply timeouts and concurrency limits around the entire logical operation, not merely one HTTP attempt.
- Bound prompt size, response tokens, stream duration, tool rounds, and concurrent generations.
- Use idempotency keys or domain-level deduplication for side-effecting tools.
- Do not share mutable chat history across concurrent turns without serialization or an explicit conflict policy.
- On shutdown, interrupt in-flight work and allow scoped clients/resources to finalize.

## Error policy

`AiError.AiError` carries an `AiErrorReason`, including provider/transport/decoding categories such as authentication failures. Preserve the reason internally for policy and diagnostics, but translate it at the application interface.

Classify at least:

- invalid/missing startup configuration;
- authentication or insufficient provider permissions;
- rate limits and transient provider availability;
- request/prompt rejection and content policy;
- malformed or schema-invalid generated output;
- tool parameter decode or tool execution failure;
- timeout, cancellation, and exhausted agent budget;
- defects.

Retry only failures known to be transient, with bounded schedules and jitter. Do not retry invalid credentials, invalid schemas, policy rejection, or non-idempotent tool effects. Do not expose provider error bodies, prompts, secrets, or internal tool results through a public error contract.

## Observability and privacy

Name operations with `Effect.fn`, add spans around model calls and tools, and record safe fields: provider, model policy name, finish reason, latency, token counts, tool name, attempt, and outcome. Avoid prompts, completions, chat history, API keys, authorization headers, raw tool parameters/results, and customer content unless a reviewed redaction and retention policy explicitly permits them.

Measure:

- latency and failure by provider/model/policy;
- input/output tokens and estimated cost;
- retries and fallback selection;
- tool-call count, duration, and failure;
- schema-decode failure;
- cancellations, timeouts, and budget exhaustion.

Use low-cardinality annotations. Never use user text, request IDs with unbounded cardinality, or whole error bodies as metric labels.

## Security

- Treat prompts, retrieved content, model output, and tool arguments as untrusted.
- Enforce authentication, authorization, tenant scope, validation, and invariants inside tool handlers—never rely on the model to enforce them.
- Minimize each toolkit per operation; do not expose ambient admin capabilities.
- Separate read and write tools. Require user confirmation or an application approval token for consequential writes.
- Protect against prompt injection: untrusted text cannot override system policy or grant capabilities.
- Apply SSRF controls to URL-fetching tools and path allowlists to file tools.
- Prevent secret/data exfiltration through prompts, tool output, telemetry, and provider-defined web/file tools.
- Review provider data retention, training, residency, and subprocess policies before sending customer data.
- Schema validation establishes shape, not truth. Apply domain validation after decoding.
- Rate-limit by authenticated scope and enforce cost quotas server-side.

## Testing

Use three levels:

1. **Application unit tests:** provide a fake `Writer`/model module and test callers without a provider.
2. **AI adapter contract tests:** use deterministic fake provider HTTP responses to cover text, usage, finish reason, object decoding, stream parts, tools, and mapped `AiError` reasons.
3. **Opt-in live smoke tests:** separate, rate-limited, secret-gated, non-blocking where appropriate; never the main deterministic suite.

Test tool handlers directly through their typed interface: authorization, cross-scope denial, malformed input, bounds, idempotency, failure mode, redaction, and audit events. Test chat isolation, export/import, concurrent turns, max-turn termination, cancellation, timeout, repeated tool calls, retry/fallback limits, and budget accounting. Do not assert exact natural-language text; assert schemas, invariants, selected metadata, and controlled fixtures.

## Anti-patterns

- Importing provider or `effect/unstable/ai` types throughout domain and transport code.
- Reading API keys with `process.env`, logging them, or defaulting missing credentials.
- Treating generated JSON as valid without `generateObject` plus a schema.
- Giving a broad toolkit to every prompt or trusting model-selected authorization scope.
- An unbounded `while (true)` agent loop.
- Retrying all `AiError`s or replaying side-effecting tools.
- Sharing one mutable `Chat` among users.
- Logging prompts/completions by default.
- Swallowing tool failures with `failureMode: "return"` without reviewing disclosure.
- Assuming schema-valid output is factually correct.
- Using live provider calls as deterministic unit tests.

## Review checklist

- [ ] Exact v4 beta and provider versions are pinned and upgraded together.
- [ ] Every unstable import is marked and localized behind a domain module.
- [ ] Required secrets use `Config.redacted` and fail initialization.
- [ ] Structured output is schema-decoded and then domain-validated.
- [ ] Retry/fallback, timeout, concurrency, token, cost, and tool-turn budgets are explicit.
- [ ] Tools enforce auth/scope and expose least capability.
- [ ] Side-effecting tools have confirmation/idempotency/replay policy.
- [ ] Chat state is isolated, retained, and protected as sensitive data.
- [ ] Errors are classified, safely mapped, and selectively retried.
- [ ] Telemetry excludes secrets and customer content by default.
- [ ] Tests are deterministic; live tests are separate and opt-in.

## Source map

| Guidance | Primary source |
|---|---|
| Provider layers, `Config.redacted`, text/object/stream generation, usage, `ExecutionPlan` | `effect-smol/ai-docs/src/71_ai/10_language-model.ts` |
| `Tool.make`, schema descriptions/defaults, `Toolkit`, handlers, failure modes, provider tools | `effect-smol/ai-docs/src/71_ai/20_tools.ts` |
| `Chat`, history, JSON export/import, model-per-turn, agent loop | `effect-smol/ai-docs/src/71_ai/30_chat.ts` |
| Concrete unstable interfaces and error reasons | `packages/effect/src/unstable/ai/*` |
| Provider behavior and fixtures | `packages/ai/openai/test/*`, `packages/ai/anthropic/test/*`, `packages/ai/openai-compat/test/*` |
| Service-local configuration rules | `.agents/skills/effect-service-config/references/config-rules.md` |

The local source paths are under `.repos/effect-smol/` at commit `3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec`. Production lifecycle limits, security controls, privacy rules, testing tiers, and review checklist are project-oriented synthesis; the unstable library does not automatically enforce all of them.
