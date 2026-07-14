# Effect HTTP Clients

Effect offers two complementary client levels:

1. `HttpClient` for third-party or otherwise hand-described HTTP APIs.
2. `HttpApiClient` for clients generated from this repository's shared `HttpApi` contract.

Use the generated typed client for first-party APIs. Use low-level `HttpClient` when no shared Effect contract exists. The concrete project client locations, cookie behavior, and contract ownership are documented in [`../api.md`](../api.md).

> **API stability:** examples use `effect/unstable/http` and `effect/unstable/httpapi`; verify APIs on Effect upgrades.
>
> **Draft-source notice:** the referenced Effect Solutions **HTTP Clients** page is a draft/community guide, not this project's authority. Its useful request, decoding, status, and retry examples are incorporated here and reconciled with Effect Smol and local rules.

## Runtime model

HTTP operations require an `HttpClient.HttpClient` service. A runtime layer provides an implementation such as `FetchHttpClient.layer`; Node or Bun adapters can be selected at the application boundary. Keep transport selection out of domain services.

```ts
import { Effect, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "effect/unstable/http"

const RemoteUser = Schema.Struct({
  id: Schema.Number,
  login: Schema.String,
})

const program = Effect.gen(function* () {
  const response = yield* HttpClient.get("https://example.test/users/1")
  return yield* HttpClientResponse.schemaBodyJson(RemoteUser)(response)
}).pipe(Effect.provide(FetchHttpClient.layer))
```

A successful network exchange is not necessarily a successful application response. Status acceptance and body decoding are separate, explicit decisions.

## Build requests with schemas

Use `HttpClientRequest` builders rather than manually constructing fetch options:

- `get`, `post`, `put`, `patch`, `del` select method and URL;
- `setHeader`/`setHeaders`, `acceptJson`, `bearerToken`, and `basicAuth` manage headers;
- `setUrlParam`/`setUrlParams` encode query parameters;
- `schemaBodyJson(InputSchema)(value)` validates/encodes a JSON body and can fail;
- `bodyJsonUnsafe` skips schema encoding and should be reserved for already-controlled internal values.

```ts
const CreateIssue = Schema.Struct({
  title: Schema.NonEmptyString,
  body: Schema.String,
})

const request = yield* HttpClientRequest.post("/issues").pipe(
  HttpClientRequest.acceptJson,
  HttpClientRequest.setUrlParams({ notify: "true" }),
  HttpClientRequest.schemaBodyJson(CreateIssue)(input),
)

const response = yield* client.execute(request)
```

Prefer schema-based bodies at trust boundaries. Never annotate/log bearer tokens, basic-auth values, cookies, or full request bodies.

## Configure a reusable low-level client

Transform a base client once for concerns shared by every operation:

```ts
import { Effect, flow, Layer, Schedule } from "effect"

const RemoteClientLayer = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const base = yield* HttpClient.HttpClient

    return base.pipe(
      HttpClient.mapRequest(
        flow(
          HttpClientRequest.prependUrl("https://api.example.test"),
          HttpClientRequest.acceptJson,
        ),
      ),
      HttpClient.retryTransient({
        schedule: Schedule.exponential(100),
        times: 3,
      }),
    )
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
```

Good client middleware concerns include base URL, stable headers, trace propagation, bounded timeout policy, and deliberately scoped retry policy. Authentication retrieval/refresh may live in a runtime adapter, but the reusable client must not own browser logout, storage clearing, redirects, or UI state.

## Decode response status and body

### Schema decoding

`HttpClientResponse.schemaBodyJson(Schema)` parses JSON and validates its shape. Treat a parse/schema mismatch as an integration failure, not as a valid empty/default response. Decode every body from an untrusted remote API, including nominal success bodies.

For non-JSON protocols, select an explicit text/bytes/form decoder and validate the resulting domain representation where appropriate.

### Explicit status matching

When status changes semantics, use `matchStatus` and decode both success and expected error bodies:

```ts
class RemoteNotFound extends Schema.TaggedErrorClass<RemoteNotFound>()(
  "RemoteNotFound",
  { id: Schema.String },
) {}

const getRemote = Effect.fn("RemoteApi.get")(function* (id: string) {
  const response = yield* client.get(`/resources/${encodeURIComponent(id)}`)

  return yield* HttpClientResponse.matchStatus(response, {
    "2xx": HttpClientResponse.schemaBodyJson(RemoteResource),
    404: (response) =>
      HttpClientResponse.schemaBodyJson(RemoteNotFound)(response).pipe(
        Effect.flatMap(Effect.fail),
      ),
    orElse: (response) =>
      Effect.fail(new UnexpectedRemoteStatus({ status: response.status })),
  })
})
```

If a third party returns no usable error body, map status to a safe local error without reading arbitrary text into logs or client-visible messages.

### Simple 2xx filtering

`HttpClientResponse.filterStatusOk(response)` or `HttpClient.filterStatusOk` rejects non-2xx responses. This is appropriate only when all non-2xx statuses have the same local meaning. If callers need to distinguish `401`, `404`, `409`, rate limiting, or remote `5xx`, match and decode first.

### Failure taxonomy

Keep these categories distinct:

- **Request error:** DNS, connection, timeout, cancellation, or another failure before a usable response.
- **Response error:** rejected status or body read/parse/decode failure.
- **Typed remote/domain error:** a recognized status plus a successfully decoded declared error body.
- **Unexpected protocol result:** undocumented status, content type, or schema.

Catch narrow tags or map at the integration boundary. Preserve enough safe cause information for operations while presenting only stable local errors to domain/UI consumers. Never convert every failure to a string.

## First-party typed `HttpApiClient`

Generate the first-party client directly from the root shared API. The generated shape mirrors groups and operation names and carries typed params, query, payload, successes, and declared errors.

```ts
import { Context, Effect, Layer, Schedule } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof AppApi>
>()("app/ApiClient") {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(AppApi, {
      transformClient: (client) =>
        client.pipe(
          HttpClient.mapRequest(
            HttpClientRequest.prependUrl("http://localhost:3000"),
          ),
        ),
    }),
  ).pipe(
    Layer.provide(AuthorizationClient),
    Layer.provide(FetchHttpClient.layer),
  )
}
```

`transformClient` is the seam for base URL, transport-level instrumentation, and carefully selected policy. Required `HttpApiMiddleware` declarations need matching client layers, for example one that attaches a bearer token. In this project's webapp, session cookies and `credentials` behavior are runtime-local; tests inject a local fetch implementation and test-local cookie state.

Do not duplicate first-party DTOs or error unions in a client package. A compile failure after a contract rename is desirable contract mismatch detection.

## Retry policy

Retries are a product and protocol decision, not a blanket reliability switch.

`HttpClient.retryTransient(...)` targets transient request failures and server failures, and can use bounded exponential backoff. A lower-level alternative is `Effect.retry(Schedule...)`, usually after narrowing the error channel.

Rules:

1. Retry only failures classified as transient: selected network failures, timeouts where safe, `408`/`429` when policy permits, and selected `5xx` responses.
2. Bound attempts and elapsed time; use exponential backoff and jitter where available to avoid synchronized retry storms.
3. Honor `Retry-After` for rate limits/service unavailability when supported.
4. Do not retry schema/decode failures, authentication failures, authorization failures, ordinary `404`s, or validation/conflict errors.
5. Reads are usually retryable. Mutations require idempotency guarantees (idempotency key, conditional request, deduplication, or a naturally idempotent operation).
6. Consider whether the server could have committed before the client lost the response. A POST can duplicate work even when the observed error looked like a network failure.
7. Keep retry telemetry low-cardinality: operation, attempt count, delay bucket, and error category—not raw URL/query/body.
8. Test retries with `TestClock`, not real sleeps.

Do not stack independent retry layers accidentally (generated client + service + atom), which multiplies attempts and latency.

## Timeouts, cancellation, and resource safety

- Set explicit connection/request deadlines appropriate to the dependency and operation.
- Preserve Effect interruption so request cancellation can stop in-flight work.
- Scope streaming bodies and other resources correctly; do not leak responses.
- Limit response sizes for untrusted dependencies.
- Avoid placing secrets in URLs because URLs appear in proxies, access logs, and spans.
- Validate redirects and destination allowlists for user-influenced URLs to mitigate SSRF and credential forwarding.

## Observability and privacy

Name integration operations with stable spans such as `BillingProvider.createCustomer` or `GitHubApi.getRepo`; let HTTP instrumentation provide protocol spans beneath them. Safe attributes include method, route template or dependency operation, status code, retry count, timeout category, response-size bucket, and non-sensitive stable IDs when approved.

Do not record:

- authorization/cookie headers;
- raw request or response bodies;
- emails, names, free text, or secrets;
- complete URLs with query strings;
- unbounded IDs or error messages as metric labels.

See [`observability.md`](./observability.md) for privacy, cardinality, and source-map requirements.

## Testing clients

For first-party e2e tests, use the generated client against the in-process web handler and temporary SQLite database described in [`../testing.md`](../testing.md). Inject `FetchHttpClient.Fetch` so requests call `HttpRouter.toWebHandler(...)` without TCP; keep cookie state in a test-local `Ref`.

For third-party clients:

- inject a deterministic fake `HttpClient`/fetch adapter;
- assert method, path, safe headers, query encoding, and schema-encoded body;
- exercise every recognized status and error-body schema;
- test malformed JSON and schema mismatches;
- test timeout/cancellation and bounded transient retries with `TestClock`;
- add a small number of sandbox/contract integration tests when the provider supports them.

## Decision checklist

- First-party API? Generate from the shared `HttpApi`; do not hand-copy types.
- Third-party API? Wrap low-level `HttpClient` behind a focused service.
- Encode request bodies and decode all response bodies with schemas.
- Decide status handling before body handling.
- Preserve request, response/decode, typed remote, and unexpected-protocol errors distinctly.
- Apply auth/base URL at the runtime boundary.
- Retry only transient, safely repeatable operations with bounded backoff.
- Add stable spans without secrets, PII, raw bodies, or high-cardinality labels.
- Test protocol behavior with an injected client and virtual time.

## Sources and precedence

1. Project rules: [`../api.md`](../api.md), [`../testing.md`](../testing.md), and `AGENTS.md`.
2. Effect Smol AI docs: `ai-docs/src/50_http-client` and the typed-client section of `ai-docs/src/51_http-server`.
3. **Draft reference:** Effect Solutions, “HTTP Clients” (`https://www.effect.solutions/http-clients`), retrieved 2026-07-10.
