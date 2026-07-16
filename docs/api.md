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

`/countries` and `/nodes/children` expose published country roots and order them
deterministically. `/nodes/children/:nodeId` first resolves the parent, selects
its allowed relationship kinds exhaustively from the parent node kind, and
returns only published children ordered by relationship position and ID. Other
public graph reads will eventually restrict results to published catalog data;
that broader publication policy is not implemented yet.

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
