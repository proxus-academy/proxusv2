# Effect Observability

Effect has first-class structured logging and tracing. This guide explains reusable instrumentation, privacy, cardinality, and source-map rules. Agent-specific OTLP ownership, privacy, retention, dashboards, and shutdown behavior are documented in [`../architecture/agent-harness.md`](../architecture/agent-harness.md).

> **API stability:** current Effect Smol guidance prefers the lightweight `effect/unstable/observability` OTLP modules for new projects; `@effect/opentelemetry` remains relevant when integrating an existing OpenTelemetry SDK. Verify APIs when upgrading Effect.
>
> **Draft-source notice:** the referenced Effect Solutions **Observability & OpenTelemetry** page is a draft/community guide. Its OTLP and custom-span examples are incorporated here only where consistent with Effect Smol and local privacy/architecture rules.

## Goals

Observability should let a developer follow one important workflow across boundaries:

```text
<module>.create                         client query/action
  http.client POST /<module>            protocol instrumentation
    http.server POST /<module>          server transport
      <Module>.create                   domain/use case
        Sql<Module>Repository.create    persistence
```

Client and server spans may remain separate when trace-context propagation is not configured. Document that limitation rather than implying end-to-end correlation.

Telemetry must be useful without becoming a data-exfiltration path or a high-cardinality billing/operations problem.

## Structured logging

Use Effect logging APIs and attach structured context at the narrowest useful scope:

```ts
const operation = Effect.gen(function* () {
  yield* Effect.logDebug("loading checkout state")
  yield* Effect.logInfo("validating cart")
  yield* Effect.logWarning("inventory is low")
}).pipe(
  Effect.annotateLogs({
    service: "checkout-api",
    operation: "checkout.validate",
  }),
  Effect.withLogSpan("checkout"),
)
```

- Prefer stable message templates plus structured safe fields.
- Do not concatenate raw input, payloads, headers, SQL, or credentials into messages.
- Use levels consistently: debug for diagnostic detail, info for meaningful lifecycle events, warning for recoverable degradation, error for failed operations requiring attention.
- Avoid logging an expected error at every layer; choose an ownership boundary to prevent duplicate noise.
- `Effect.withLogSpan` adds duration context to logs; tracing spans are still preferred for distributed causal structure.

Logger layers can select console JSON for production ingestion, pretty/default output for development, file output when deliberately managed, or a custom batched logger. Set the minimum log level through configuration/reference layers rather than conditionals scattered through product code. Batched exporters need bounded buffers, flush behavior, and graceful-shutdown finalizers.

## Tracing operations

Name spans around stable operations, not implementation line numbers or dynamic values:

```ts
const create = Effect.fn("Projects.create")(function* (input: CreateInput) {
  yield* Effect.annotateCurrentSpan({
    "project.name.length": input.name.length,
    "project.has_parent": input.parentId !== undefined,
  })
  // ...
})
```

Use `Effect.withSpan("name")` for a specific sub-operation and `Effect.fn("Name")` for named service functions. `Effect.annotateSpans(...)` adds attributes to an effect's spans; `Effect.annotateCurrentSpan(...)` annotates the active span. Layers can use `Layer.withSpan(...)` when initialization itself is important.

Recommended names:

| Layer | Pattern | Example |
| --- | --- | --- |
| Web atom/client action | `<module>.<operation>` | `todos.create` |
| Manual HTTP adaptation | `http.<module>.<operation>` | `http.todos.create` |
| Domain service | `<Module>.<operation>` | `Todos.createForUser` |
| Repository adapter | `<Adapter><Module>Repository.<operation>` | `SqlTodosRepository.createForUser` |
| Migration | migrator's stable migration name | `Migrator 1_initial` |

Do not create a span for every trivial pure function. Instrument remote calls, use cases, persistence work, contention/queues, retries, and expensive or failure-prone boundaries.

## Safe HTTP and service attributes

Good attributes include:

- HTTP method and normalized route pattern (`/projects/:id`, not the raw URL);
- stable operation/module name;
- status code and coarse outcome/error category;
- safe boolean flags, counts, lengths, and bounded buckets;
- retry attempt and backoff bucket;
- approved opaque/internal ID only when the debugging value outweighs linkability risk;
- non-sensitive enum values with a bounded set.

Never record:

- passwords, bearer/session/API tokens, cookies, authorization headers, or secrets;
- raw request/response bodies;
- emails, names, addresses, free-form titles/descriptions, payment data, or private customer content;
- complete URLs or query strings;
- SQL statements with values;
- arbitrary exception messages from external systems;
- configuration secret values.

The Effect Smol examples annotate search text, todo titles, and order IDs for demonstration. **Do not copy those annotations blindly.** Under this project's policy, use `search.length`, `title.length`, booleans, counts, or approved opaque IDs instead.

## Privacy and data governance

Treat logs, spans, baggage, metric labels, and exported errors as another persistent data store:

1. Classify fields before instrumenting them (public, internal, confidential, regulated, secret).
2. Minimize collection; “useful someday” is not a purpose.
3. Redact at instrumentation time, not only at the collector.
4. Apply environment-specific retention and access controls.
5. Encrypt transport and storage; authenticate exporters/collectors.
6. Keep production telemetry destinations and tenant access isolated.
7. Define deletion/subject-access implications for any stable user-linked identifier.
8. Sample deliberately without preferentially exposing sensitive failures.
9. Review telemetry changes like API/storage changes.

Hashing an email or customer ID does not automatically anonymize it; stable hashes remain linkable and often guessable. Prefer omission, aggregation, ephemeral correlation, or approved opaque IDs.

Do not put sensitive values in OpenTelemetry baggage: baggage propagates across service boundaries and may be copied into many systems.

## Cardinality controls

Cardinality is the number of distinct attribute values. Unbounded cardinality makes metrics expensive and trace/log search less useful.

Never use these as metric label dimensions:

- user/resource/request/span IDs;
- raw URL, query, or route params;
- error messages or stack traces;
- timestamps;
- free-form input;
- arbitrary tenant names.

Prefer bounded dimensions such as method, normalized route, operation, status class, error tag, deployment environment, adapter type, retry bucket, and a reviewed finite enum.

Traces can tolerate more per-event detail than metrics, but cost/privacy still apply. Use stable IDs only when explicitly approved; avoid copying them into logs and metric labels. Bucket numeric values (payload size, latency class, item count) rather than exporting exact unbounded values when aggregation is the goal.

Set limits in the SDK/collector for attribute count/length, event count, batch/queue size, and accepted resource attributes. Drop unsafe headers and URL query strings centrally as defense in depth, while still preventing them at the source.

## Errors and causes

Expected domain errors should be visible by stable tag and safe context, often with a non-error or known-error status according to local conventions. Unexpected defects must not be swallowed; record failure status/cause through Effect's tracing/reporting infrastructure and add only safe context.

At the HTTP mapping seam:

- log/trace the safe repository and operation names;
- classify the failure (`RepositoryError`, timeout, decode, defect);
- return the declared safe `InternalServerError` body;
- do not export raw SQL, credentials, payloads, or customer content.

Avoid recording the same stack at repository, service, handler, and global runtime levels. Preserve the cause chain and choose one principal reporting boundary.

## OTLP layer composition

Effect Smol's lightweight modules separate tracing, logging, serialization, and transport:

```ts
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import {
  OtlpLogger,
  OtlpSerialization,
  OtlpTracer,
} from "effect/unstable/observability"

const Tracing = OtlpTracer.layer({
  url: "http://localhost:4318/v1/traces",
  resource: {
    serviceName: "app-server",
    serviceVersion: "1.0.0",
    attributes: { "deployment.environment": "development" },
  },
})

const Logging = OtlpLogger.layer({
  url: "http://localhost:4318/v1/logs",
  resource: {
    serviceName: "app-server",
    serviceVersion: "1.0.0",
  },
})

export const ObservabilityLayer = Layer.merge(Tracing, Logging).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
)
```

Provide observability near the outside of the application layer graph so it sees spans created during service/layer operation. Keep configuration in the observability layer that owns it, validate required production settings at startup, and allow an explicit disabled mode for local/test use.

An existing OpenTelemetry SDK may instead use `@effect/opentelemetry` (for example an OTLP layer and span-context bridge). Do not install two competing tracer/logger providers. Ensure graceful shutdown flushes exporters; bound queues and choose an overload/drop policy so telemetry cannot take down the product path.

Use stable resource attributes: service name, version, deployment environment, and instance/region only when useful. Never put per-request, per-user, or secret values in resource attributes.

## Trace context propagation

- Use standard W3C `traceparent`/`tracestate` propagation through HTTP instrumentation.
- Continue externally created spans with the appropriate span-context bridge when integrating non-Effect instrumentation.
- Configure browser CORS to permit required propagation/export headers only from intended origins.
- Do not trust inbound baggage as authorization or product context.
- Sanitize baggage and do not propagate credentials or PII.
- Document whether browser-to-server propagation is enabled; otherwise expect separate traces.

## Source maps and stack traces

Source maps make minified/transpiled production stacks actionable, but they can expose source code and embedded source content.

### Generation

- Generate source maps for server and browser production builds when operational debugging requires them.
- Preserve the exact map/artifact pairing by release/version/commit; a map from another build produces misleading stacks.
- Keep release/service version consistent between telemetry resources, deployed bundles, and the error-processing system.
- Verify stack traces resolve to TypeScript source in a staging smoke test.

### Publication and access

- Prefer hidden/private source maps uploaded to the trusted error/observability backend rather than publicly served `.map` files.
- Do not include a public `sourceMappingURL` if maps are not intended for browsers.
- Restrict artifact-bucket/backend access and retention.
- Decide deliberately whether `sourcesContent` is needed; omitting it reduces source disclosure but requires the backend to access source artifacts separately.
- Prevent maps from containing secrets, `.env` values, generated credentials, private source outside the release, or sensitive build paths.
- Exclude source maps from normal static deployment unless public maps are an explicit reviewed choice.

### Runtime behavior

Enable source-map stack support in the owning runtime/build configuration (for example the platform's source-map support), not ad hoc in services. Keep raw mapped stacks out of client responses and ordinary public logs. Symbolicate in a controlled backend, then apply the same privacy/access/retention rules as other telemetry.

## Sampling and reliability

- Use head sampling for predictable cost and tail/collector sampling when retaining errors or high-latency traces is important.
- Sampling decisions must not use sensitive attributes.
- Keep representative success traffic as well as failures.
- Track exporter drops/queue saturation separately; absent traces can mean export failure, not healthy traffic.
- Telemetry export should normally fail independently from product operations.
- Rate-limit repetitive errors and avoid retry storms from the OTLP exporter.

## Testing instrumentation

Most tests should use no-op/test observability and must not export to shared collectors. Focused instrumentation tests may assert:

- stable span name and parent/child relation;
- expected error status/category;
- presence of approved route/method/count/length attributes;
- absence of credentials, PII, raw bodies, query strings, and free text;
- bounded retry events/cardinality;
- exporter finalization for runtime wiring.

Do not snapshot full spans with nondeterministic IDs/timestamps. Do not make domain behavior depend on whether an exporter is available.

## Local verification

Use the deployment documentation for commands and current service names. A complete verification should establish:

1. collector/backend starts and its UI is reachable;
2. endpoint configuration enables server and/or browser export;
3. application restart picks up configuration;
4. generated traffic creates expected services;
5. a common mutation shows client, HTTP, domain, and repository operations (or the documented split traces);
6. errors are visible with safe tags and without sensitive fields;
7. mapped stacks resolve to the matching release where source maps are configured;
8. disabling export does not break application startup in environments where disabled mode is allowed.

When spans are missing, check application traffic, endpoint path/protocol (`/v1/traces` or collector-specific base URL), CORS, service configuration, collector health, exporter queues/errors, sampling, clock skew, and application restart. If only collector self-telemetry appears, application spans are not reaching it.

## Instrumentation review checklist

- Stable operation names at client, HTTP, domain, and persistence boundaries.
- Route templates rather than raw URLs.
- No secrets, auth headers, cookies, PII, raw bodies, free text, or SQL values.
- Counts/lengths/booleans/buckets replace user input.
- Metric dimensions have a reviewed finite cardinality.
- Expected and unexpected failures are distinguishable without duplicate reporting.
- OTLP resources identify service/version/environment and contain no request data.
- Export queues, shutdown flush, sampling, and failure isolation are configured.
- Trace propagation and any split-trace limitation are documented.
- Source maps match the release, are privately accessible, and expose no secrets.
- Local workflow and expected trace shape remain current in the owning deployment documentation.

## Sources and precedence

1. Project rules: [`../architecture/agent-harness.md`](../architecture/agent-harness.md), [`../api.md`](../api.md), and `AGENTS.md`.
2. Effect Smol AI docs: `ai-docs/src/08_observability` (structured logging and lightweight OTLP tracer/logger layers).
3. Local Effect observability skill (layer naming, safe annotations, and workflow shape).
4. **Draft reference:** Effect Solutions, “Observability & OpenTelemetry” (`https://www.effect.solutions/observability`), retrieved 2026-07-10.
