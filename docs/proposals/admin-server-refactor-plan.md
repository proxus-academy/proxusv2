# Plan de refactor: servidores público y administrativo independientes

> **Estado:** implementado (etapas 1–8)  
> **Propuesta relacionada:** [`separate-public-admin-deployments-and-pulumi.md`](separate-public-admin-deployments-and-pulumi.md)  
> **Alcance:** separación de procesos y packages backend; excluye Docker, Pulumi, GCP, IAM e IAP  
> **Fecha:** 2026-07-16

## Objetivo

Separar el backend combinado actual en dos ejecutables y cuatro packages reutilizables:

```text
apps/server        → monta únicamente PublicApi
apps/admin-server  → monta únicamente AdminApi

packages/backend-domain
packages/backend-infra
packages/backend-transport
packages/backend-admin-transport
```

Study Catalog conservará el mismo nombre en cada capa participante:

```text
backend-domain/src/modules/study-catalog
backend-infra/src/modules/study-catalog
backend-transport/src/modules/study-catalog
backend-admin-transport/src/modules/study-catalog
```

La separación package-first no cambia el flujo obligatorio:

```text
HTTP handler → service/use case → repository port → adapter
```

## Decisión de responsabilidades

### `@proxus/backend-domain`

Contiene comportamiento independiente de transporte e infraestructura:

- modelo interno y reglas de Study Catalog;
- servicios/casos de uso Effect;
- repository ports y errores internos;
- Layers neutrales que construyen servicios desde ports;
- implementaciones memory/test cuando modelen el port, no SQL;
- tests de modelo y servicio.

No puede importar:

- HttpApi o handlers;
- Drizzle;
- PGlite/PostgreSQL;
- Node;
- SDKs de GCP u otros proveedores.

### `@proxus/backend-infra`

Contiene adapters concretos:

- clientes y Layers de database;
- schema Drizzle;
- adapter `StudyCatalogRepository` para Drizzle;
- Layers PGlite y PostgreSQL;
- migraciones, checks y seeds;
- infraestructura de test de adapters.

Depende de `backend-domain` para implementar sus ports y de `shared` para schemas de wire solo cuando el mapeo lo requiera. No contiene decisiones de producto.

Object storage solo se moverá aquí cuando implemente un port consumido por dominio. No se extraerá como abstracción anticipatoria en este refactor.

### `@proxus/backend-transport`

Contiene exclusivamente transporte HTTP público:

- handlers de `PublicApi`;
- traducción request/response;
- traducción segura de errores;
- middleware público específico;
- Layer de handlers públicos;
- tests del transporte sustituyendo el servicio en su interface.

Depende de `shared` y `backend-domain`. No depende de `backend-infra`.

### `@proxus/backend-admin-transport`

Contiene exclusivamente transporte HTTP administrativo:

- handlers de `AdminApi`;
- traducción request/response;
- traducción segura de errores;
- seam futuro de identidad administrativa;
- Layer de handlers administrativos;
- tests del transporte sustituyendo el servicio.

Depende de `shared` y `backend-domain`. No depende de `backend-infra` ni contiene todavía IAP.

### Ejecutables

`apps/server` y `apps/admin-server` son los únicos módulos que conocen transport e infraestructura simultáneamente. Seleccionan Layers, configuración, puerto y lifecycle; no contienen reglas de producto.

## No objetivos

Quedan fuera:

- Dockerfiles y artefactos compilados de producción;
- Pulumi, GCS, Cloud Run y Cloud SQL gestionado;
- IAM, IAP y autorización final;
- previews por PR;
- rediseñar Study Catalog;
- añadir nuevos bounded contexts;
- extraer object storage sin un port real.

## Arquitectura objetivo

```text
packages/shared
├── PublicApi
├── AdminApi
└── ProxusApi                      # tooling/tests solamente

packages/backend-domain
└── src/modules/study-catalog/
    ├── model.ts
    ├── repository.ts
    ├── service.ts
    ├── service.live.ts
    └── testing.ts

packages/backend-infra
├── src/database/
│   ├── pglite.ts
│   ├── postgres.ts
│   └── migrate.ts
├── src/modules/study-catalog/
│   ├── schema.ts
│   ├── repository.drizzle.ts
│   ├── repository.pglite.layer.ts
│   ├── repository.postgres.layer.ts
│   └── seed.ts
└── drizzle/

packages/backend-transport
└── src/modules/study-catalog/http.ts

packages/backend-admin-transport
└── src/modules/study-catalog/http.ts

apps/server
├── src/http.ts
├── src/layers/http.ts
├── src/dev.ts
└── src/prod.ts

apps/admin-server
├── src/http.ts
├── src/layers/http.ts
├── src/dev.ts
└── src/prod.ts
```

## Grafo de dependencias

```text
@proxus/shared
      ↑
@proxus/backend-domain
      ↑             ↑
backend-transport   backend-admin-transport
      ↑             ↑
apps/server         apps/admin-server
      ↑             ↑
      └── backend-infra ──┘
```

Restricciones:

```text
backend-domain           ✗ backend-infra
backend-domain           ✗ transports
backend-transport        ✗ backend-infra
backend-admin-transport  ✗ backend-infra
backend-infra            ✗ transports
apps/server              ✗ backend-admin-transport
apps/admin-server        ✗ backend-transport, salvo decisión explícita futura
```

## Etapa 1 — Separar contratos raíz

Modificar:

```text
packages/shared/src/api.ts
packages/shared/src/api.test.ts
packages/shared/package.json
```

Cambios:

- crear `PublicApi` con `PublicStudyCatalogApi`;
- crear `AdminApi` con `AdminStudyCatalogApi`;
- conservar `ProxusApi` como composición para tooling/tests;
- exportar raíces por paths deliberados;
- impedir que entrypoints productivos importen `ProxusApi`.

Tests:

- Public contiene rutas públicas y ninguna `/admin/*`;
- Admin contiene rutas administrativas y ninguna pública;
- la composición contiene ambas;
- OpenAPI, status y errores no cambian.

## Etapa 2 — Crear `@proxus/backend-domain`

Crear:

```text
packages/backend-domain/package.json
packages/backend-domain/tsconfig.json
packages/backend-domain/src/modules/study-catalog/index.ts
```

Mover desde `apps/server/src/modules/study-catalog/`:

```text
model.ts
model.test.ts
repository.ts
service.ts
service.live.ts
service.live.test.ts
```

Añadir o mover soporte memory/testing cuando corresponda.

Ajustes:

- cambiar identificadores `Context` que contengan `@proxus/server/...`;
- eliminar imports accidentales de HTTP, SQL o Node;
- exportar una interface pública pequeña del módulo;
- mantener repository port junto al servicio que lo necesita.

Validación:

```bash
pnpm --filter @proxus/backend-domain typecheck
pnpm --filter @proxus/backend-domain test
```

Criterio de salida: servicio y tests funcionan sin transporte ni persistencia real.

## Etapa 3 — Crear `@proxus/backend-infra`

Crear:

```text
packages/backend-infra/package.json
packages/backend-infra/tsconfig.json
packages/backend-infra/drizzle.config.ts
```

Mover infraestructura transversal desde:

```text
apps/server/src/infrastructure/database/
```

A:

```text
packages/backend-infra/src/database/
```

Mover adapters de Study Catalog desde:

```text
apps/server/src/modules/study-catalog/adapters/
```

A:

```text
packages/backend-infra/src/modules/study-catalog/
```

Mover:

```text
apps/server/drizzle/
apps/server/drizzle.config.ts
```

A:

```text
packages/backend-infra/drizzle/
packages/backend-infra/drizzle.config.ts
```

Ajustes obligatorios:

- implementar ports importados desde `backend-domain`;
- mantener schema de persistencia fuera del dominio;
- corregir paths relativos de migraciones y `.data`;
- parametrizar `applicationName` de PostgreSQL por ejecutable;
- trasladar scripts de migration, check, seed y reset al package propietario;
- separar usuario/runtime de migraciones conceptualmente, aunque cloud quede fuera;
- no mover object storage hasta que implemente un port real.

Tests:

- contrato del repository sobre PGlite;
- pruebas específicas de Drizzle y constraints;
- PostgreSQL cuando esté disponible;
- migración desde vacío y pending detection;
- seeds deterministas e idempotentes.

Criterio de salida: Infra implementa Domain y puede proveer Layers PGlite/PostgreSQL sin depender de HTTP.

## Etapa 4 — Crear los dos transports

### Público

Crear:

```text
packages/backend-transport/package.json
packages/backend-transport/tsconfig.json
packages/backend-transport/src/modules/study-catalog/http.ts
packages/backend-transport/src/modules/study-catalog/http.test.ts
packages/backend-transport/src/http.ts
```

Mover la parte pública de:

```text
apps/server/src/modules/study-catalog/http.ts
```

El package monta `PublicApi` o exporta sus handlers/Layer para que el composition root lo haga. No conoce adapters concretos.

### Administrativo

Crear:

```text
packages/backend-admin-transport/package.json
packages/backend-admin-transport/tsconfig.json
packages/backend-admin-transport/src/modules/study-catalog/http.ts
packages/backend-admin-transport/src/modules/study-catalog/http.test.ts
packages/backend-admin-transport/src/http.ts
```

Mover la parte administrativa del handler actual.

Debe existir un seam explícito para identidad administrativa futura, pero no se implementará un wrapper vacío de IAP. Mientras la excepción temporal siga vigente, el transport documentará que no es seguro para exposición pública.

### Traducción de errores

Si ambos transports necesitan la misma traducción de errores internos, preferir una función pequeña en `backend-domain` solo si expresa una clasificación neutral. No introducir dependencia entre transports ni un quinto package `transport-common` por pocas líneas.

### Tests

Para cada transport, sustituir `StudyCatalog` en su interface y verificar:

- adaptación de argumentos;
- status declarados;
- errores públicos seguros;
- ausencia de acceso al repository;
- superficie OpenAPI correcta.

Criterio de salida: ambos transports compilan y se prueban sin importar `backend-infra`.

## Etapa 5 — Convertir `apps/server` en composition root público

Modificar:

```text
apps/server/package.json
apps/server/tsconfig.json
apps/server/src/http.ts
apps/server/src/layers/http.ts
apps/server/src/dev.ts
apps/server/src/prod.ts
apps/server/src/http.pglite.test.ts
```

Añadir:

```text
apps/server/src/http.surface.test.ts
```

Cambios:

- depender de `backend-transport`, `backend-domain` y `backend-infra`;
- montar exclusivamente `PublicApi`;
- componer public handlers + servicio + adapter PGlite/PostgreSQL;
- eliminar dependencias directas que ya sean propiedad de packages;
- no importar `AdminApi`, `ProxusApi` ni `backend-admin-transport`.

Tests:

- arranque con PGlite;
- operaciones públicas completas;
- `/admin/*` devuelve `404`;
- OpenAPI no contiene rutas administrativas;
- el grafo no requiere capacidades administrativas.

## Etapa 6 — Crear `apps/admin-server`

Crear:

```text
apps/admin-server/package.json
apps/admin-server/tsconfig.json
apps/admin-server/src/http.ts
apps/admin-server/src/layers/http.ts
apps/admin-server/src/dev.ts
apps/admin-server/src/prod.ts
apps/admin-server/src/http.pglite.test.ts
apps/admin-server/src/http.surface.test.ts
```

Cambios:

- depender de `backend-admin-transport`, `backend-domain` y `backend-infra`;
- montar exclusivamente `AdminApi`;
- usar un puerto de desarrollo distinto, previsiblemente `3001`;
- configurar `applicationName` propio;
- no importar `PublicApi`, `ProxusApi` ni `backend-transport`.

Tests:

- arranque con PGlite;
- mutaciones administrativas completas;
- rutas públicas devuelven `404`;
- OpenAPI no contiene rutas públicas;
- public y admin operan contra una misma Layer PGlite en un test in-process sin compartir router.

## Etapa 7 — Adaptar clientes frontend

Modificar previsiblemente:

```text
packages/frontend-core/src/study-catalog/client.ts
apps/admin/src/modules/study-catalog/api.ts
apps/web/vite.config.ts
apps/admin/vite.config.ts
```

Cambios:

- cliente público generado desde `PublicApi`;
- cliente admin generado desde `AdminApi`;
- Admin compone ambos clientes cuando necesita lecturas genuinamente públicas;
- URLs/proxies distintos para ambos procesos;
- no duplicar rutas públicas bajo `/admin`.

Decidir explícitamente el desarrollo local: dos procesos no deben abrir el mismo directorio PGlite sin confirmar soporte. Preferir PostgreSQL local compartido o PGlite in-process para tests.

## Etapa 8 — Workspace, documentación y limpieza

Modificar:

```text
package.json
pnpm-lock.yaml
README.md
AGENTS.md
docs/api.md
docs/testing.md
docs/architecture/domain-driven-architecture.md
docs/architecture/access-control.md
```

Workspace:

- añadir los cuatro packages y `admin-server` a diagnostics/typecheck/test/build;
- añadir comandos dev separados;
- dar ownership único a scripts database;
- usar exports de package para reforzar dependencias permitidas.

Documentación:

- registrar los cuatro packages y sus responsabilidades;
- conservar organización por bounded context dentro de cada uno;
- documentar ambos ejecutables y puertos;
- mantener advertencia de que Admin sigue temporalmente sin autenticación;
- dejar Pulumi/IAP fuera de esta entrega.

Limpieza, solo después de actualizar todos los imports:

```text
apps/server/src/modules/study-catalog/
apps/server/src/infrastructure/database/
apps/server/src/layers/study-catalog.dev.ts
apps/server/src/layers/study-catalog.prod.ts
apps/server/src/test/http/embedded.ts
apps/server/drizzle/
apps/server/drizzle.config.ts
```

## Estrategia de tests

### Domain

- reglas y modelo puros;
- servicio con repository memory;
- coordinación, errores e invariantes;
- sin HTTP ni SQL.

### Infra

- contrato de repository PGlite/PostgreSQL;
- constraints, mapping y errores;
- migraciones y seeds;
- Layers de adapter.

### Transports

- servicio sustituido en su interface;
- decode/encode, argumentos y status;
- traducción segura de errores;
- OpenAPI y ausencia de rutas cruzadas.

### Composition roots

- public: cliente tipado → PublicApi → servicio real → PGlite;
- admin: cliente tipado → AdminApi → servicio real → PGlite;
- integración de ambos routers contra persistencia compartida sin combinarlos;
- smoke de Layers de producción cuando PostgreSQL esté disponible.

## Validación

```bash
pnpm effect:diagnostics
pnpm --filter @proxus/shared test
pnpm --filter @proxus/backend-domain typecheck
pnpm --filter @proxus/backend-domain test
pnpm --filter @proxus/backend-infra typecheck
pnpm --filter @proxus/backend-infra test
pnpm --filter @proxus/backend-transport typecheck
pnpm --filter @proxus/backend-transport test
pnpm --filter @proxus/backend-admin-transport typecheck
pnpm --filter @proxus/backend-admin-transport test
pnpm --filter @proxus/server typecheck
pnpm --filter @proxus/server test
pnpm --filter @proxus/admin-server typecheck
pnpm --filter @proxus/admin-server test
pnpm typecheck
pnpm test
pnpm build
```

Añadir el check database al package que realmente lo exponga. No presentar `boundaries` o `verify:architecture` como ejecutados mientras no existan.

## Criterios de aceptación

1. `server` sirve exclusivamente `PublicApi`.
2. `admin-server` sirve exclusivamente `AdminApi`.
3. Ningún entrypoint productivo importa `ProxusApi`.
4. `backend-domain` no depende de HTTP, SQL, Drizzle, Node ni cloud.
5. Ambos transports dependen del servicio, no de Infra.
6. `backend-infra` implementa ports de Domain y no contiene reglas de producto.
7. Solo las apps conocen transport e Infra simultáneamente.
8. Study Catalog conserva el mismo nombre y locality razonable en cada package.
9. Persistencia, migraciones y seeds tienen un único propietario.
10. Existen tests negativos de rutas y OpenAPI.
11. Los clientes frontend se generan desde raíces estrechas.
12. Diagnostics, typecheck, tests y build pasan.
13. La documentación no presenta todavía la separación como autenticación completa.

## Riesgos

- los cuatro packages pueden convertirse en capas shallow o barrels globales;
- pérdida de locality si Study Catalog no mantiene estructura paralela clara;
- imports accidentales de Infra desde transports;
- duplicación de traducción de errores entre transports;
- paths relativos de migraciones/PGlite tras mover archivos;
- tags `Context` con nombres antiguos;
- dos procesos intentando poseer el mismo PGlite;
- Admin necesita clientes y URLs públicas/administrativas distintas;
- object storage queda temporalmente fuera de la arquitectura compartida;
- movimientos sobre un working tree con cambios no confirmados.

Mitigación principal: exports pequeños, dependencias unidireccionales, tests por interface y cambios incrementales.

## Secuencia de commits sugerida

1. `refactor(shared): split public and admin api roots`
2. `refactor(backend): extract domain services and repository ports`
3. `refactor(backend): extract persistence adapters and migrations`
4. `refactor(backend): split public and admin transports`
5. `refactor(server): make public server a composition root`
6. `feat(admin-server): add independent admin composition root`
7. `refactor(frontend): use separate public and admin clients`
8. `docs: document backend package architecture`

Cada commit debe conservar una interface estable y no mezclar Pulumi, Docker o autenticación.