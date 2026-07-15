# Proxus HTTP API

The executable schema-first contract in `packages/shared/src/api.ts` is the
source of truth. This document records route policy and compatibility decisions.
Contracts use `effect/unstable/httpapi` from the exact Effect version pinned by
the workspace.

## Architecture

```text
packages/shared: HttpApi + Schema
        ↓
apps/server: handler → service → repository port → adapter
        ↓
apps/web and apps/admin: generated typed client → Effect Atom
```

Shared contracts contain paths, methods, transport schemas, public models,
expected errors and statuses. They never expose repositories, Drizzle rows,
database errors or server configuration.

## Public study catalog

Prefix: `/study-catalog`

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/nodes/:nodeId` | Read a catalog node |
| GET | `/edges/:edgeId` | Read a graph edge |
| GET | `/nodes/:nodeId/outgoing-edges` | List outgoing edges |
| GET | `/nodes/:nodeId/incoming-edges` | List incoming edges |
| GET | `/nodes/:nodeId/targets` | List related target nodes |
| GET | `/nodes/:nodeId/sources` | List related source nodes |

Public handlers will eventually restrict results to published catalog data. That
publication policy belongs to the application service and is not implemented by
the current repository reads.

## Administrative study catalog

Prefix: `/admin/study-catalog`

| Method | Path | Operation |
| --- | --- | --- |
| POST | `/nodes` | Create a draft node |
| PATCH | `/nodes/:nodeId/name` | Rename a node |
| POST | `/nodes/:nodeId/archive` | Archive a node |
| POST | `/edges` | Connect two nodes |
| DELETE | `/edges/:edgeId` | Disconnect two nodes |

Authentication and authorization middleware will be added before these handlers
are exposed. Keeping the group separate prevents public routes from accidentally
inheriting admin policy or vice versa.

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
and explicit deprecation windows. OpenAPI is generated from `ProxusApi` and its
semantic paths/statuses are tested in `packages/shared/src/api.test.ts`.
