# Proxus HTTP API

The executable schema-first contracts in `packages/shared/src/public-api.ts`
and `packages/shared/src/admin-api.ts` are the production sources of truth.
`packages/shared/src/api.ts` composes them only for tooling and contract tests. This document records route policy and compatibility decisions.
Contracts use `effect/unstable/httpapi` from the exact Effect version pinned by
the workspace.

## Architecture

```text
packages/shared: PublicApi + AdminApi + Schema
        ↓
backend-transport / backend-admin-transport: handlers → backend-domain: service → repository port
        ↓
apps/server / apps/admin-server: transport + backend-infra adapter
```

Shared contracts contain paths, methods, transport schemas, public models,
expected errors and statuses. They never expose repositories, Drizzle rows,
database errors or server configuration.

## Public study catalog

Prefix: `/study-catalog`

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/countries` | List published country roots (compatibility endpoint) |
| GET | `/nodes/children` | List published navigation roots |
| GET | `/nodes/children/:nodeId` | List the published children selected by the parent kind |
| GET | `/nodes/:nodeId` | Read a catalog node |
| GET | `/edges/:edgeId` | Read a graph edge |
| GET | `/nodes/:nodeId/outgoing-edges` | List outgoing edges |
| GET | `/nodes/:nodeId/incoming-edges` | List incoming edges |
| GET | `/nodes/:nodeId/targets` | List related target nodes |
| GET | `/nodes/:nodeId/sources` | List related source nodes |

Every public read exposes only published nodes. A graph edge is public only when
both endpoint nodes are published. Node-based graph routes treat an unpublished
anchor exactly like a missing node (`404`), and direct edge reads similarly hide
edges with either unpublished endpoint. Lists filter this policy in persistence
and preserve deterministic relationship position/ID ordering.

`/countries` and `/nodes/children` expose published country roots.
`/nodes/children/:nodeId` first resolves a published parent, selects its allowed
relationship kinds exhaustively from the parent node kind, and returns only
published children. Administrative reads remain unfiltered and can inspect all
node statuses and their edges.

## Administrative study catalog

Prefix: `/admin/study-catalog`

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/nodes?kind=&status=` | List nodes filtered by required kind and status |
| GET | `/nodes/:nodeId` | Read a node from the administrative catalog |
| GET | `/nodes/:nodeId/outgoing-edges` | List outgoing edges from the administrative catalog |
| GET | `/nodes/:nodeId/incoming-edges` | List incoming edges from the administrative catalog |
| GET | `/nodes/:nodeId/targets` | List related target nodes from the administrative catalog |
| GET | `/nodes/:nodeId/sources` | List related source nodes from the administrative catalog |
| POST | `/nodes` | Create a draft node |
| PATCH | `/nodes/:nodeId/name` | Rename a node |
| PATCH | `/nodes/:nodeId/status` | Set a node status to `draft`, `published` or `archived` |
| POST | `/edges` | Connect two nodes and insert in their ordered source/type group |
| PATCH | `/edges/:edgeId` | Edit edge endpoints and position while preserving `id` and `_tag` |
| DELETE | `/edges/:edgeId` | Disconnect two nodes and compact their ordered group |

During the current development phase these handlers are intentionally exposed
without authentication or authorization. This is an explicit temporary product
decision and does not block admin development. They run in the separate
`apps/admin-server` process (development port `3001`), which must not be exposed
publicly until administrative identity is added at the transport boundary.

The admin UI performs both reads and mutations through this administrative
surface so they use the same persistence adapter. This is required in local
PGlite development, where the public and admin server processes have separate
data directories. Both `kind` and `status` are required on node list requests;
unfiltered and partially filtered queries are rejected as malformed input. The
filters combine with `AND`, and results are ordered deterministically by name
and ID.

Edge order is scoped by `(from, _tag)` and positions are contiguous from zero.
Connecting without `position` appends to that group; an explicit position inserts
there (clamped to the group end). Updating an edge preserves its `id` and `_tag`,
validates the new endpoint kinds and duplicate triple, and compacts both the old
and new groups in one transaction. Disconnecting compacts the former group in
the same transaction.

## Public feature flags

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/feature-flags/snapshot` | Read the complete active public configuration snapshot |

Snapshots are immutable revisions and activation is atomic: clients never merge
individual flags from different revisions. Configurations explicitly carry `enabled`;
a disabled flag resolves to the frontend's known safe default. The first flag is
`registration.landing` with the closed frontend variants `short` and `long`. If persistence contains no active row,
the service returns revision `0` with an empty `flags` array. Responses include a
revision-derived strong `ETag`, support the RFC weak comparison semantics of
`If-None-Match` (including lists, weak tags and `*`) with `304`, and use
`Cache-Control: public, max-age=60, stale-while-revalidate=300`. These flags are
frontend-only product presentation and are never authorization evidence.

## Public realtime

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/realtime/events` | Receive best-effort server-sent invalidation hints |

The schema-first success contract uses `HttpApiSchema.StreamSse`. A
`FeatureFlagSnapshotChanged` message contains an opaque `eventId` and `revision`; clients deduplicate the pair and refetch
`GET /feature-flags/snapshot` and retain its ETag/cache behavior instead of
merging state from the stream. `RealtimeHeartbeat` messages keep idle
connections and intermediaries alive but carry no state.

Delivery is process-local and best-effort: there is no durable replay, resume
cursor, cross-instance fan-out, or guarantee that every revision is observed.
After initial connection, reconnection, a revision gap, or any stream error,
clients fetch the snapshot. The connection and its PubSub subscription are
scoped to the HTTP stream and released on disconnect/interruption.

There is no real user/session authentication infrastructure in the repository yet. Consequently this endpoint is intentionally anonymous and can publish only public feature-flag hints; the snapshot TTL/refetch path remains fully functional without SSE. A server-side connection-scope port models verified `principalId`, `userId`, `sessionId`, roles and permissions for future authenticated channels. Private scopes fail closed when identity or permission is absent. Identity must never be accepted from query parameters, request bodies, or frontend filtering.

## Public product analytics

| Method | Path | Operation |
| --- | --- | --- |
| POST | `/product-analytics/events` | Best-effort batch ingestion (1–50 browser events) |

The public contract accepts only `feature_flag_exposed`, `registration_started`
and `registration_completed` for the registration landing vertical. Every event
carries immutable `flagKey`, `variant` and `revision`; the envelope adds the subject
resolved by trusted transport context. The backend rejects invalid subjects and
reconstructs the local initial assignment when viable. Identity and consent are
never trusted from the JSON body. Consent and identity come from trusted transport
context, never from the payload. Production currently fails closed until that
middleware exists. Development opt-in additionally requires matching `Origin`
and `Host`, `Sec-Fetch-Site: same-origin`, and the explicit development consent
header.

Admission is atomic for the whole request batch: one invalid event or insufficient
queue capacity rejects all events. Acceptance means admitted to a bounded in-process queue, not durably persisted.
The response reports accepted/rejected counts and a safe reason (`no-consent`,
`invalid`, `full`, or `closed`). Events outside the configured timestamp-skew
window and flag exposures that the server cannot recalculate are excluded.
The schema bounds a batch to 50 events, but the HTTP server does not yet enforce a
raw byte body limit. Adding that limit belongs in the shared HTTP server policy so
all endpoints get consistent `413` handling; analytics must remain fail-closed at
the edge until that transversal work is completed.

Analytics is intentionally best-effort: it must not affect product behavior and
is not suitable for audit, authorization, billing, or exactly-once workflows.

## Status policy

- malformed params or payloads: built-in `400` decoding failure;
- missing node or edge: `404`;
- duplicate edge: `409`;
- persisted endpoint-kind mismatch: `422`;
- successful creation: `201`;
- successful disconnect: `204`;
- repository or operational failure: safe bodyless `500`.

Public errors are stable schemas. Internal causes, SQL messages and stack traces
must never cross the HTTP boundary.

## Compatibility

Changing a path, method, field representation, status semantics, authentication
requirement or public error body is normally breaking. Prefer additive endpoints
and explicit deprecation windows. Each executable generates OpenAPI from its narrow root (`PublicApi` or
`AdminApi`). `ProxusApi` remains available only for tooling and contract tests.
