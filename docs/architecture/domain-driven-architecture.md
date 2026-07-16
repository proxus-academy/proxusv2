# Arquitectura de dominio de Proxus

> **Estado:** normativa de arquitectura
> **Alcance:** backend Effect, contratos compartidos y procesos ejecutables  
> **Última revisión:** 2026-07-16

## Organización

Proxus organiza cada capacidad como un bounded context con el mismo nombre en las capas que realmente participan. Study Catalog está distribuido así:

```text
packages/shared/src/modules/study-catalog/                 contrato de wire
packages/backend-domain/src/modules/study-catalog/         modelo, ports y casos de uso
packages/backend-infra/src/modules/study-catalog/          adapters Drizzle
packages/backend-transport/src/modules/study-catalog/      HTTP público
packages/backend-admin-transport/src/modules/study-catalog/ HTTP administrativo
```

No todos los contexts necesitan todas las capas. No se crean packages, directorios ni wrappers vacíos para anticipar necesidades.

## Packages y ejecutables

| Ubicación | Responsabilidad | Dependencias permitidas |
| --- | --- | --- |
| `packages/shared` | Schemas, errores y raíces `PublicApi`/`AdminApi`; `ProxusApi` solo para tooling/tests | Effect runtime-neutral |
| `packages/backend-domain` | Modelo interno, servicios y repository ports | `shared` |
| `packages/backend-infra` | Database, migraciones, seeds y adapters concretos | `backend-domain`, `shared` cuando el mapping lo requiere |
| `packages/backend-transport` | Handlers de `PublicApi` y traducción segura de errores | `backend-domain`, `shared` |
| `packages/backend-admin-transport` | Handlers de `AdminApi` y seam de identidad administrativa | `backend-domain`, `shared` |
| `apps/server` | Composition root del servidor público | domain + infra + transport público |
| `apps/admin-server` | Composition root del servidor administrativo | domain + infra + transport administrativo |

El flujo obligatorio es:

```text
HTTP handler → service/use case → repository port → adapter
```

Los ejecutables son los únicos lugares que conocen simultáneamente transport e infraestructura. No contienen reglas de producto.

## Dirección de dependencias

```text
shared ← backend-domain ← backend-transport ← apps/server
                    ↖ backend-admin-transport ← apps/admin-server
                    ← backend-infra ↗
```

Restricciones:

- Domain no importa HttpApi, SQL, Drizzle, Node ni SDKs cloud.
- Los transports no importan Infra ni repositories concretos.
- Infra no importa transports.
- `apps/server` no importa `AdminApi` ni el transport administrativo.
- `apps/admin-server` no importa `PublicApi` ni el transport público.
- Ningún entrypoint productivo importa `ProxusApi`.
- Un módulo no importa internals o adapters de otro módulo; colabora mediante su superficie pública.

## Contratos y transporte

`packages/shared` contiene únicamente lo que cruza el límite proceso/cliente: IDs y modelos públicos, requests, responses, errores estables y contratos HttpApi. No contiene filas SQL, configuración del servidor ni implementación de repositories.

Los handlers adaptan transporte, invocan servicios y convierten errores internos a respuestas públicas seguras. La autorización de producto pertenece al servicio; el transporte obtendrá una identidad verificada cuando se implemente el control de acceso.

## Infraestructura y persistencia

`backend-infra` es el propietario único de database, schema Drizzle, migraciones, checks y seeds. Los adapters implementan ports de Domain sin introducir decisiones de producto. PGlite cubre desarrollo y tests rápidos; PostgreSQL cubre producción y desarrollo con dos procesos que deban compartir datos.

Object storage permanece local al ejecutable mientras no implemente un port requerido por Domain. No se extrae una abstracción sin un consumidor real.

## Frontend

Los clientes públicos se generan desde `PublicApi`. Admin compone un cliente `AdminApi` para mutaciones/consultas administrativas y otro `PublicApi` para lecturas públicas, con URLs distintas. El flujo es:

```text
view → atom → application client o platform port → adapter
```

La lógica neutral vive en `frontend-core`, los adapters web en `frontend-web` y las apps componen runtimes, pantallas y rutas. Consulta `docs/webapp-architecture.md` y `docs/effect/react-and-effect-atom.md`.

## Testing

- Domain: modelo y servicio con repository memory.
- Infra: contrato de repository, constraints, migraciones y seeds con PGlite/PostgreSQL.
- Transports: servicio sustituido en su interface; adaptación, status y errores.
- Composition roots: clientes tipados, persistencia real y ausencia de rutas cruzadas.
- Frontend: atoms con Layers de test y comportamiento observable de componentes.

No se presentan `boundaries` ni `verify:architecture` como checks disponibles hasta que existan scripts reales en el workspace.
