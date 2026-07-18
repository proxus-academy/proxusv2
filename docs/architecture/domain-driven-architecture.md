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

Feature Flags usa el mismo flujo completo para distribuir snapshots públicos:
`shared` define el wire snapshot, Domain lee el snapshot activo mediante un
repository port, Infra persiste revisiones completas en PostgreSQL/PGlite y el
transport público aplica caché HTTP. La identidad de instalación y la evaluación
son frontend-only y no cruzan al backend.

No todos los contexts necesitan todas las capas. No se crean packages, directorios ni wrappers vacíos para anticipar necesidades.

## Eventos backend y reactions

`BackendAppEvent` es el catálogo global tipado, compuesto desde uniones de
eventos propiedad de cada módulo; no representa una cola física ni promete
persistencia, orden o replay. Inicialmente contiene
`FeatureFlagSnapshotPublished`, emitido por
`FeatureFlagSnapshotPublisher.publishSnapshot` después de persistir y activar la
revisión. La lectura pública usa el servicio separado
`FeatureFlagSnapshotReader`, que no depende del bus de eventos.

`AppEventBus` es un dispatcher backend in-process y best-effort. Los módulos
aportan contributions tipadas que el composition root reúne en un registry
estático; este selecciona reactions por tag. El bus usa una cola bounded: cuando
se llena, `publish` aplica backpressure, y no completa hasta que todas las
reactions coincidentes se han intentado. Las ejecuta con concurrencia acotada y
aislamiento observable de fallos para que una integración secundaria no rompa
las demás ni el caso de uso ya persistido. En shutdown deja de admitir eventos,
intenta drenar la cola durante un timeout y reporta explícitamente cuántos se
pierden si vence. No promete persistencia ni entrega entre procesos. El primer
reaction proyecta el evento de Feature Flags al contrato realtime público;
analytics no es una reaction mientras no exista un evento backend analítico real.

```text
FeatureFlagSnapshotPublisher.publishSnapshot → repository.publish → AppEventBus
                                                    → realtime reaction
                                                      → scoped PubSub
                                                        → SSE clients
```

`RealtimeBroker` es el port intercambiable de publicación/suscripción realtime;
su adapter memory actual usa un PubSub scoped, acotado y freshness-first. La
misma instancia de Layer se comparte entre reactions y handlers SSE, y libera
suscripciones al desconectar. No es el catálogo global, el bus ni una outbox. Si una reaction futura requiere
entrega durable, transacciones entre publicación y persistencia, replay o cruce
de procesos, debe usar una outbox/broker explícito en vez de endurecer estas
abstracciones in-memory.

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
