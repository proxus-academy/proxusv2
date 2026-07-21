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

Every public node response is limited to `published` nodes. Every public edge
is visible only while both endpoint nodes are published. Graph collections apply
the same rule: outgoing/incoming edges include only visible edges, and
target/source collections include only published related nodes. An unpublished
or archived anchor is indistinguishable from absence and returns `404`, rather
than an empty collection. `/nodes/children/:nodeId` additionally selects its
allowed relationship kinds exhaustively from the persisted parent kind. Roots
and graph collections keep deterministic relationship position/ID ordering.
Administrative reads do not apply this publication policy.

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
the same transaction. Create, update and disconnect lock every affected source
node row in lexical UUID order before locking or changing edge rows. Updates
and disconnects first observe the edge only to discover its source lock key,
then lock the source set and re-read the edge `FOR UPDATE`; if a concurrent move
changed its source while they waited, they finish a no-op transaction and retry
with fresh keys. This serializes PostgreSQL writers per source and gives all
edge writers the same source(s)-before-edge lock order; moves lock old and new
sources in the same stable order.

## Public feature flags

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/feature-flags/snapshot` | Read the complete active public configuration snapshot |

Snapshots are immutable revisions and activation is atomic: clients never merge
individual flags from different revisions. Configurations explicitly carry `enabled`;
a disabled flag resolves to the frontend's known safe default. The first flag is
`registration.landing` with the closed frontend variants `short` and `long`. If persistence contains no active row,
the service returns revision `0` with an empty `flags` array. Revision `0` is
reserved exclusively for that synthetic value: publication Schema and the SQL
constraint require persisted revisions in `1..Number.MAX_SAFE_INTEGER`. The
migration that introduced this stricter lower bound upgrades a pre-existing
persisted revision `0` to the next free positive revision before adding the
constraint. Its one-time transaction temporarily removes and then restores the
immutable-row trigger; legacy object-shaped configuration JSON has its nested
`configurationRevision` changed to the same value.

The schema-first request declares the optional `If-None-Match` header and the
complete response set:

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `FeatureFlagSnapshot` | Current active snapshot |
| `304` | empty | Supplied validator weakly matches the active revision |
| `500` | empty | Safe internal failure; no repository or schema detail |

Successful reads include a revision-derived strong `ETag` and
`Cache-Control: public, max-age=300, stale-while-revalidate=300`. The generated
OpenAPI operation declares the optional request validator, `200`/`304`/`500`,
and the `ETag`/`Cache-Control` headers on both cacheable responses.
`If-None-Match` follows RFC weak comparison semantics, including entity-tag
lists, weak tags and `*`. Distribution is deliberately pull-based through
PostgreSQL and HTTP conditional requests because the publishing command runs in
a different process from the public server. These flags are frontend-only
product presentation and are never authorization evidence.

## Public product analytics

| Method | Path | Operation |
| --- | --- | --- |
| POST | `/product-analytics/events` | Best-effort batch ingestion (1–50 browser events) |

The public contract accepts only `feature_flag_exposed`, `registration_started`
and `registration_completed` for the registration landing vertical. The latter
means only “the browser UI reached its completion step”; it is non-authoritative
telemetry and does not assert that a backend registration succeeded. Every event
carries immutable `flagKey`, `variant` and `revision`; the envelope adds the subject
resolved by trusted transport context. Revision `0` represents the empty remote
snapshot and therefore accepts only the local safe default `short`; it is not
hashed as an allocation. Later revisions remain client-reported telemetry until
a snapshot-history verifier exists. Identity and consent are never trusted from
the JSON body. Consent and identity come from trusted transport context, never
from the payload. Production currently fails closed until that middleware exists.
Development opt-in additionally requires matching `Origin` and `Host`,
`Sec-Fetch-Site: same-origin`, and the explicit development consent header.

Admission is atomic for the whole request batch: one invalid event or insufficient
queue capacity rejects all events. Acceptance means admitted to a bounded in-process queue, not durably persisted.
The response reports accepted/rejected counts and a safe reason (`no-consent`,
`invalid`, `full`, or `closed`). Events outside the configured timestamp-skew
window and flag exposures that the server cannot recalculate are excluded.
The schema bounds a batch to 50 events. Both public and administrative
composition roots additionally apply `HttpServerRequest.MaxBodySize` at 256 KiB
before any `HttpApi` body decoder runs. An oversized declared or streamed body
returns a bodyless `413`; normal bodies continue to receive endpoint-specific
schema validation. This shared executable policy covers every schema-first route
in each server, including analytics.

Analytics is intentionally best-effort: it must not affect product behavior and
is not suitable for audit, authorization, billing, or exactly-once workflows.

## Status policy

- raw request body over 256 KiB: bodyless `413` before schema decoding;
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
