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

## Autenticación pública

Prefijo: `/auth`. Las respuestas de sesión instalan una cookie opaca `HttpOnly`; el token, los códigos y los hashes nunca forman parte del wire.

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/availability/email?email=` | Comprobar disponibilidad normalizada de email |
| GET | `/availability/username?username=` | Comprobar disponibilidad normalizada de nombre de usuario |
| POST | `/register/email` | Crear alta pendiente y enviar código (`202`) |
| POST | `/verify-email` | Consumir código, activar cuenta y crear sesión |
| POST | `/verify-email/resend` | Reemitir de forma no enumerable (`202`) |
| POST | `/login` | Login email/password y sesión |
| POST | `/password-reset/request` | Solicitud no enumerable (`202`) |
| POST | `/password-reset/confirm` | Cambiar password y revocar sesiones |
| POST | `/google/start` | Crear redirect/state/nonce sin semántica cacheable |
| GET | `/google/callback` | Resolver login, auto-link o draft Google |
| POST | `/google/register` | Completar onboarding de identidad Google nueva |
| GET | `/session` | Leer sesión activa; requiere cookie |
| POST | `/logout` | Revocar sesión activa; requiere cookie |

## Realtime autenticado

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/events` | Stream SSE de señales realtime para la cuenta autenticada |

`GET /events` requiere la misma cookie opaca que `/auth/session`; el cliente no
elige el account ID. Cada frame usa `event: realtime`, un `id` generado por el
servidor y un `data` validado por la unión `RealtimeEvent`. El stream incluye
`realtime.heartbeat` para mantener activa la conexión y actualmente puede
entregar `session.refresh-required` cuando una operación autoritativa revoca
todas las sesiones de la cuenta.

La entrega es best-effort e in-process: no existe replay por `Last-Event-ID` ni
garantía de recepción durante una desconexión. Los eventos son señales para
releer estado autoritativo mediante los endpoints HTTP existentes. La respuesta
usa `text/event-stream`, deshabilita caché y solicita no buffering a proxies
compatibles.

Registro recibe el onboarding completo, incluida la fuente de adquisición, y el identificador de la asignatura elegida. La fuente usa una clasificación cerrada; `other` exige un detalle de hasta 200 caracteres. El navegador recorre dinámicamente los hijos publicados del grafo y conserva la ruta solo como estado transitorio, pero no la envía como autoridad. El servidor comprueba que la asignatura sea publicada y terminal, deriva su único padre publicado como estudio y persiste ambos identificadores (`studyId` y `subjectId`). No confía en nombres, relaciones de catálogo ni perfiles Google enviados por el navegador. Verificación y reset usan challenges hasheados, con propósito, expiración, intentos y uso único. Login devuelve errores genéricos; reset y reenvío no revelan si existe una cuenta. Google usa authorization-code/callback: una identidad existente entra directamente, un email activo y verificado puede auto-vincularse de forma transaccional y una identidad nueva recibe un draft pendiente antes del alta.

`GoogleAuthorization.authorizationUrl` admite una URL HTTP(S) absoluta para el
proveedor real y una ruta same-origin que empiece por `/` para adapters mock de
desarrollo. No admite URLs protocol-relative. El mock local vuelve así al mismo
host desde el que se abrió la web, incluido un hostname de Tailscale. La
respuesta de inicio se sirve con `Cache-Control: no-store`: contiene un
`state`/nonce de un solo uso y nunca puede reutilizarse desde la caché.

Las comprobaciones de disponibilidad normalizan con las mismas reglas que el alta y solo devuelven `{ available }`; no exponen cuentas, estados ni proveedores. Deben protegerse con rate limiting en el borde de despliegue antes de habilitarse públicamente en producción.

Los endpoints protegidos por `SessionAuthorization` responden `401` si la cookie falta o no resuelve una cuenta activa. La renovación deslizante puede rotar la cookie en cualquier respuesta autenticada; no existe endpoint de refresh.

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

Las colecciones públicas de nodos incluyen `userCount`, calculado en una única consulta sobre los paths validados de cuentas activas. `imageUrl` queda como campo opcional del contrato para que el adapter de entrega de assets pueda incorporarlo sin cambiar de nuevo la forma pública.

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

These handlers run in the separate `apps/admin-server` process (development
port `3001`) and use the same opaque sessions as the public authentication
surface. Administrative reads require an active authenticated account. Catalog
mutations additionally require their resource capability: `student` receives
`403`, while global `catalog-editor` and `admin` assignments permit the current
catalog operations. `/admin/access-control/capabilities` returns the effective
permissions for the authenticated subject; only global administrators may grant
or revoke role assignments. Missing or invalid sessions return `401`.

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

The public contract accepts `feature_flag_exposed`, `registration_started`,
`registration_completed`, `registration_step_viewed` and
`registration_step_completed` for the registration vertical. Completion
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
In development the queue writes append-only rows to the same persistent PGlite
database used by the application (`product_analytics_events`); tests may still
provide the memory adapter explicitly. Production uses BigQuery and never falls
back silently to memory.

## Control de acceso administrativo

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/admin/access-control/capabilities` | Permisos efectivos del subject autenticado |
| POST | `/admin/access-control/roles` | Conceder una asignación (solo admin global) |
| DELETE | `/admin/access-control/roles` | Revocar una asignación (solo admin global) |
| GET | `/admin/users` | Listar cuentas sin exponer credenciales (solo admin global) |
| PATCH | `/admin/users/:userId/status` | Desactivar o reactivar una cuenta verificada (solo admin global) |

Toda `AdminApi` requiere sesión. Las mutaciones de catálogo se autorizan además dentro del service contra el recurso persistido: ausencia de identidad produce `401`, falta de permiso `403` y fallo del role store un `500` seguro. Capabilities son una ayuda de presentación, no evidencia que el cliente pueda reenviar.

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
