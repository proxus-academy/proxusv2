# Observability and agent trace inspection

This document records the currently implemented operational trace and inspector
behavior. General Effect instrumentation rules live in
[`effect/observability.md`](./effect/observability.md); harness ownership and
security rules live in
[`architecture/agent-harness.md`](./architecture/agent-harness.md).

## Signal and storage boundaries

OpenTelemetry spans, metrics and safe logs describe operation, latency, outcome
and low-cardinality dimensions. They are best-effort operational signals, not a
replay source. The agent journal remains the durable source of run transitions.

The technical model trace inspector intentionally separates metadata from bytes:

- PostgreSQL/PGlite stores run and journal records plus `agent_trace_payloads`
  metadata: trace/span/run IDs, provider/model, timing, usage, capture status,
  schema/redaction versions, optional expiry, artifact reference, byte count and
  SHA-256.
- `ArtifactStore` stores the gzip payload bytes and enforces artifact access by
  tenant, run and role. SQL does not contain the payload and `ArtifactStore` is
  not used as a metadata query engine.
- The admin inspector joins these at the service boundary: SQL provides the run,
  safe journal summary and trace reference; `ArtifactStore` resolves bytes only
  for the matching run.

## Technical payload format and capture

The current payload is gzip-compressed JSON envelope **schema v1** with
**redaction v1**. It contains provider/model and timing, redacted request
instructions/messages, ordered text deltas with offsets, and the terminal
response/finish reason. Capture applies redaction before persistence, truncates
individual deltas, then deterministically reduces the envelope until the
uncompressed JSON is within `MAX_TRACE_ENVELOPE_BYTES`. The envelope explicitly
sets `truncated` when content was reduced. Metadata records
`contentType: application/json`, `contentEncoding: gzip`, compressed byte count,
and SHA-256 computed over the exact gzip bytes stored.

Redaction and truncation reduce exposure; they are not anonymization guarantees.
The capture decorator is best-effort and cannot change model delivery or run
outcome. Metadata starts as `pending`; successful storage becomes `stored`.
Artifact failures become `failed` with a safe category when metadata can still
be written, and a stream lacking its terminal event is recorded as incomplete.
Failures writing capture metadata itself are swallowed.

`expiresAt` is currently nullable and no automatic expiry is assigned to newly
captured payloads. This is the implemented initial policy; there is currently no
24-, 30-, or 90-day retention guarantee. Cleanup only acts on explicitly expired
artifacts. A production retention window requires explicit configuration,
operational cleanup and tests before documentation may claim it.

The admin server reads payloads through the same `ArtifactStore` port. Set `AGENT_ARTIFACTS_DIR` for the filesystem adapter (required in production and defaulting to `.proxus/agent-runs-artifacts` in development); distributed deployments must replace that Layer with shared object storage.

## Inspector and trace explorer

The typed admin API lists runs, returns a run timeline and trace metadata, and
returns payload bytes as base64 with content metadata. The admin UI downloads
stored payloads as `.json.gz`. It may also link a trace to an external explorer
when the optional Vite build variable is set:

```dotenv
VITE_AGENT_TRACE_EXPLORER_URL=https://tempo.example/explore?traceId={traceId}
```

The first `{traceId}` token is replaced with the URL-encoded trace ID. If the
variable is absent or empty, no explorer link is rendered. The explorer is an
operational correlation aid; its data is not the inspector payload or durable
run source of truth.

## Security warning

**The admin agent-run routes and downloadable payload endpoint are temporarily
unauthenticated. They expose sensitive model input/output even after redaction.**
The current admin server is suitable only for trusted local/non-public
development deployment. Do not expose it publicly, and do not treat obscurity,
redaction or an external explorer URL as access control. Production deployment
requires authenticated administrative identity, authorization, tenant scope,
audited payload access and an explicit retention policy.

## CLI streaming semantics

`pnpm agent run` and interactive `pnpm agent chat` consume the model stream and
write each text delta to stdout as it arrives. They do not buffer the full answer
before display and do not print the terminal answer a second time. The terminal
completion is nevertheless required to settle the durable result and chat
context; ending without it fails the turn. `run` writes its final run ID/status
to stderr after the streamed stdout. Durable `run` invocations are eligible for
technical capture; chat turns have no run invocation and are not persisted as
trace payloads.
