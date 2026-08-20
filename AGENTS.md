# Agent guide — Proxus v2

Este archivo define las reglas globales para agentes que trabajan en el repositorio. La documentación de `docs/*` es la fuente normativa para cada área; el código existente sirve como contexto de integración, pero no debe copiarse sin comprobar que respeta esas reglas.

## Objetivo y estado del repositorio

Proxus v2 es un workspace `pnpm` full-stack basado en TypeScript, Effect v4 y React.

- `apps/server`: API HTTP tipada y backend Effect. Usa PGlite durante el desarrollo y PostgreSQL en producción, con persistencia y migraciones Drizzle.
- `apps/site`: sitio público estático en Astro para portada, contenido editorial y páginas informativas.
- `apps/web`: aplicación web de producto y propietaria de sus adapters de navegador.
- `apps/admin`: aplicación administrativa.
- `apps/dev-server`: composition root exclusivo de desarrollo; monta las APIs pública y administrativa sobre una sola PGlite.
- `apps/storybook`: entorno Storybook del sistema de diseño.
- `packages/shared`: contratos, schemas y modelos compartidos entre clientes y servidor.
- `packages/frontend-core`: estado y lógica frontend independientes de una plataforma concreta.
- `packages/ui`: componentes reutilizables y sistema de diseño.

Los frontends se encuentran en distintos grados de desarrollo; no deben tratarse automáticamente como shells vacíos. `study-catalog` es la principal implementación de referencia para el flujo backend completo.

`.repos/*` contiene submodules upstream de referencia. No forma parte del workspace y no debe modificarse salvo petición explícita.

## Fuentes normativas

Antes de realizar cambios relevantes, consulta la documentación correspondiente:

- Effect v4: `docs/effect/*`.
- DDD, bounded contexts y módulos: `docs/architecture/domain-driven-architecture.md`.
- API HTTP pública y administrativa: `docs/api.md`.
- Estrategia y convenciones de pruebas: `docs/testing.md`.
- Sitio público estático Astro: `docs/architecture/public-site.md`.
- Arquitectura React, estado derivado y sincronización: `docs/webapp-architecture.md`.
- Effect Atom con React: `docs/effect/90_react_and_effect_atom.md`.
- Effect Form y convenciones de formularios: `docs/forms/README.md` y el capítulo específico aplicable de `docs/forms/*`.

La referencia upstream de Effect está en `.repos/effect-smol`. Las referencias ayudan a entender APIs y patrones, pero las decisiones documentadas en este repositorio prevalecen para Proxus.

## Principios generales

- Usa los scripts y paquetes reales del workspace; no asumas que existen herramientas por aparecer en repositorios de referencia o versiones anteriores.
- Mantén los cambios enfocados, revisables y coherentes con los límites de módulo.
- No introduzcas abstracciones, capas o módulos vacíos para anticipar necesidades hipotéticas.
- No copies mecánicamente el módulo más cercano: úsalo para localizar puntos de integración y valida el diseño contra `docs/*`.
- Cuando cambien arquitectura, API, persistencia, estrategia de pruebas o límites de módulo, actualiza la documentación relevante en el mismo cambio.
- Evita mezclar refactors amplios, formateo masivo y cambios funcionales no relacionados.

## Arquitectura backend

El flujo obligatorio es:

```text
HTTP handler → service/use case → repository port → adapter
```

Responsabilidades:

- Los handlers adaptan transporte, invocan servicios y convierten resultados y errores a la API HTTP.
- Los handlers no acceden directamente a la base de datos ni a adapters de persistencia.
- Los services contienen comportamiento de producto, coordinación y decisiones del caso de uso.
- Los repository ports expresan las necesidades de persistencia del dominio sin depender de Drizzle, PostgreSQL o HTTP.
- Los adapters implementan esos ports y encapsulan los detalles de PGlite, PostgreSQL y Drizzle.
- Los contratos y errores visibles para clientes pertenecen a `packages/shared` cuando deban compartirse.
- Los errores internos de infraestructura no deben filtrarse sin transformar a respuestas públicas seguras.

`study-catalog` sirve como ejemplo de schemas compartidos, service, repository port, adapter Drizzle y handlers reales. No obstante, cualquier extensión debe contrastarse con la documentación normativa.

## Módulos y bounded contexts

Un bounded context usa el mismo nombre de módulo en las capas que realmente participan en la funcionalidad. Según el alcance, puede aparecer en:

- `packages/shared`
- `apps/server/src/modules/<module>`
- `packages/frontend-core`
- `apps/web`
- `apps/admin`

No todos los cambios requieren presencia en todas las capas. No crees directorios o wrappers vacíos solo para mantener una simetría artificial.

Las dependencias entre módulos deben representar relaciones de dominio explícitas. Evita importar detalles internos de otro módulo cuando un contrato, port o servicio público pueda expresar la colaboración.

## Arquitectura frontend

El frontend sigue un enfoque atom-first con Effect Atom:

- Los componentes renderizan estado y despachan eventos.
- El estado de aplicación, estado remoto, URL reactiva, mutaciones y formularios se modelan primero con atoms cuando corresponda.
- El estado puramente visual y local puede permanecer en el componente; no eleves estado sin necesidad.
- La lógica compartida e independiente de plataforma pertenece a `packages/frontend-core`.
- Los adapters e integración específicos del navegador pertenecen a `apps/web/src/platform`; Admin posee sus propios adapters.
- Los componentes reutilizables y primitives visuales pertenecen a `packages/ui`.
- Las aplicaciones componen rutas, pantallas y comportamiento específico del producto; no deben duplicar lógica compartible sin motivo.
- Mantén el branching de carga, éxito y error visible y cerca de la superficie que lo presenta.
- Las mutaciones deben invalidar o actualizar todos los atoms afectados por el cambio.

Consulta `docs/webapp-architecture.md` y `docs/effect/90_react_and_effect_atom.md` antes de añadir estado remoto, sincronización con URL o formularios complejos.

## UI y Storybook

- Reutiliza `packages/ui` antes de crear componentes equivalentes dentro de una aplicación.
- Mantén la lógica de producto fuera de primitives genéricas de UI.
- Prefiere composición a componentes con proliferación de props booleanas.
- Añade stories junto a los componentes cuando introduzcas estados visuales o interacciones reutilizables relevantes.
- Usa `apps/storybook` para revisar el sistema de diseño de forma aislada.

## Planificación de cambios no triviales

Antes de implementar un cambio transversal, determina explícitamente qué capas están afectadas:

```text
- contrato compartido/API: sí/no
- persistencia y repositories: sí/no
- services/casos de uso: sí/no
- handlers HTTP: sí/no
- frontend core/atoms: sí/no
- adapters frontend web: sí/no
- UI, pantallas y rutas: sí/no
- tests y fixtures: sí/no
- documentación: sí/no
```

Para capacidades nuevas, define primero el límite del módulo y las relaciones de dominio. No empieces por la UI si la funcionalidad requiere antes contratos, persistencia o casos de uso.

Si una entidad pertenece o referencia a otra entidad visible para el usuario, considera tanto su vista global como su uso contextual en la pantalla padre. Documenta el motivo si se omite una superficie esperable.

## Pruebas

- Sigue `docs/testing.md` para elegir el nivel de prueba y construir layers de test.
- Prueba los services independientemente del transporte y de la persistencia real cuando sea viable.
- Añade pruebas de adapters para consultas, restricciones y mapeos de persistencia.
- Usa clientes tipados en pruebas HTTP cuando se valide el contrato completo.
- En frontend, prueba el comportamiento y los estados observables; no acoples las pruebas a detalles internos de atoms o componentes.
- Una corrección de bug debería incluir una prueba de regresión cuando sea razonable.

## Validación

Ejecuta la validación proporcional al alcance del cambio.

Backend y contratos Effect:

```bash
pnpm effect:diagnostics
pnpm --filter @proxus/shared test
pnpm --filter @proxus/server test
```

Paquete o aplicación afectada:

```bash
pnpm --filter <paquete> typecheck
pnpm --filter <paquete> test
pnpm --filter <paquete> build
```

Comprobación estática y global:

```bash
pnpm validate:self-test
pnpm static
pnpm test
pnpm build
```

`pnpm static` incluye diagnostics completos de Effect para los 16 proyectos TypeScript del workspace (también sus configs TS), typecheck, Oxlint type-aware sobre TypeScript 7, dependency-cruiser, Knip y contratos de packages. No existe baseline de hallazgos aceptados ni deben añadirse allowlists para ocultarlos. `pnpm validate:pr` ejecuta el self-test, `static`, los tests Vitest/PGlite implementados y los builds.

`pnpm check` conserva el atajo histórico `typecheck` + `build`; no incluye tests ni el resto de validadores estáticos. `check`, `static` y `validate:pr` no requieren PostgreSQL ni Docker; el workflow añade un job separado con PostgreSQL 17 que ejecuta migraciones y `@proxus/backend-infra test:postgres` como gate real mínimo. Los journeys de browser siguen pendientes y no son un gate. Consulta `docs/testing.md` antes de describir la cobertura real.

Al finalizar, indica qué comandos se ejecutaron, su resultado y qué comprobaciones relevantes no se ejecutaron.

## Cambios y commits

Un cambio o commit debería tener un propósito claro, incluir sus pruebas y documentación relacionadas, y poder revisarse sin ruido ajeno.

Para funcionalidades grandes, separa cuando sea práctico:

1. contratos y documentación;
2. persistencia y repositories;
3. services y pruebas de dominio;
4. handlers y pruebas HTTP;
5. atoms y adaptadores frontend;
6. UI, pantallas y stories;
7. validación y limpieza final.

No es obligatorio crear commits si el usuario no lo solicita, pero evita producir un diff amplio que mezcle preocupaciones independientes.
