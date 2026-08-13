# Separación de APIs y despliegue con Pulumi

> **Estado:** aceptada parcialmente; backend e IaC implementados, runtimes cloud pendientes de gates
>
> **Alcance:** backend, contratos HTTP, seguridad administrativa, infraestructura y entornos
>
> **Fecha:** 2026-07-16
>
> **Actualización de implementación:** 2026-08-13

## Resumen

Proxus despliega conceptualmente la API pública y la API administrativa como procesos e imágenes Docker independientes. La separación de entrypoints e imágenes ya está implementada; su despliegue cloud aún no. Ambos procesos reutilizan los mismos servicios de aplicación y ports de dominio, pero montan contratos HTTP distintos y seleccionan sus adapters mediante Layers en composition roots mínimos.

La infraestructura está declarada con Pulumi TypeScript. La implementación final usa workflows de GitHub Actions y scripts versionados, no Automation API: Cloud Build solo construye/publica y Pulumi converge por digest; los workflows ordenan migración y servicios.

La plataforma implementada en código es Google Cloud:

- Cloud Run para API pública, Admin y jobs de migración;
- PostgreSQL externo en Neon, referenciado mediante IDs configurables de Secret Manager y no provisionado por esta IaC;
- Artifact Registry para cuatro imágenes inmutables;
- Secret Manager para referencias a secretos runtime preexistentes;
- IAP directo de Cloud Run y un grupo configurable para Admin y previews;
- GCS versionado y KMS como backend DIY del state de Pulumi;
- un stack persistente `production` y stacks efímeros `pr-<number>` bajo demanda.

Solo foundation y su bootstrap GCS/KMS han sido provisionados. Un preview posterior mostró 48 recursos sin cambios. Production y previews existen como programas/workflows, pero siguen sin aplicar hasta cerrar los gates del runbook; no hay entornos cloud `development` o `staging` implementados.

## Motivación

La propuesta nació cuando un único servidor montaba grupos HTTP públicos y administrativos. Esa limitación ya se resolvió con entrypoints, routers e imágenes backend separados; queda pendiente verificar el aislamiento operativo en cloud.

La separación física pretende:

1. eliminar las rutas administrativas de la imagen y router públicos;
2. restringir el servicio administrativo mediante IAM, IAP e ingress;
3. permitir composition roots y adapters de infraestructura distintos por despliegue;
4. reutilizar servicios y reglas de dominio sin duplicarlos en transportes;
5. revisar cambios full-stack en entornos aislados por pull request;
6. mantener infraestructura y orquestación de despliegue en TypeScript.

La restricción de plataforma es defensa en profundidad. No sustituye autorización de producto, auditoría ni validación de la identidad transmitida por IAP.

## Capas afectadas

```text
- contrato compartido/API: sí
- persistencia y repositories: sí, por extracción física y composición
- services/casos de uso: sí, por extracción física sin cambio funcional inicial
- handlers HTTP: sí, se separan por audiencia
- frontend core/atoms: posiblemente, para clientes público/admin separados
- adapters frontend web: sí, para clientes y configuración por API
- UI, pantallas y rutas: no necesariamente en la primera fase
- tests y fixtures: sí
- documentación: sí
```

## Arquitectura objetivo

La separación se implementará mediante cuatro packages backend con responsabilidades explícitas. Los bounded contexts conservarán el mismo nombre y una estructura vertical dentro de cada package participante.

```text
packages/shared
├── PublicApi
├── AdminApi
├── ProxusApi                 # composición exclusiva de tooling/tests
└── schemas y errores de wire

packages/backend-domain
└── study-catalog
    ├── modelo y reglas de dominio
    ├── servicios/casos de uso
    ├── repository ports
    └── Layers neutrales y testing del servicio

packages/backend-infra
├── database transversal
├── migraciones y seeds
└── study-catalog
    ├── schema de persistencia
    ├── adapter Drizzle
    ├── PGlite
    └── PostgreSQL

packages/backend-transport
└── study-catalog
    ├── handlers públicos
    └── PublicHttpLive

packages/backend-admin-transport
└── study-catalog
    ├── handlers administrativos
    └── AdminHttpLive

apps/server
└── PublicApi + backend-transport + backend-infra

apps/admin-server
└── AdminApi + backend-admin-transport + backend-infra
```

Esta separación es intencionadamente técnica en el nivel package, pero vertical por bounded context en el interior. `study-catalog` no se divide en packages propios: aparece únicamente en las capas donde tiene comportamiento real.

`backend-domain` es neutral respecto a transporte y persistencia. Contiene servicios y repository ports porque ambos expresan necesidades e invariantes del dominio. `backend-infra` implementa esos ports y encapsula Drizzle, PGlite, PostgreSQL, migraciones y detalles operativos. Los transports adaptan exclusivamente sus contratos HTTP al servicio de dominio.

Object storage pertenecerá a `backend-infra` solo cuando sea un adapter requerido por un port real; no se moverá para crear infraestructura sin consumidor.

## Dirección de dependencias

```text
shared ← backend-domain ← backend-infra
   ↑           ↑
   ├── backend-transport
   └── backend-admin-transport

server       → backend-transport + backend-infra
admin-server → backend-admin-transport + backend-infra
```

Reglas:

- los handlers invocan servicios, nunca adapters persistentes;
- `backend-domain` no importa HTTP, Drizzle, PostgreSQL, Node ni SDKs cloud;
- `backend-infra` depende de repository ports de `backend-domain` e implementa sus interfaces;
- ningún transport importa `backend-infra` ni adapters concretos;
- las apps ejecutables son los únicos composition roots que conocen transport e infraestructura simultáneamente;
- cada composition root provee únicamente las capacidades requeridas por su superficie;
- Public y Admin comparten invariantes, no necesariamente representaciones ni políticas HTTP;
- las lecturas administrativas solo reutilizan contratos públicos cuando su semántica sea realmente idéntica;
- `ProxusApi` no se importa desde entrypoints de producción.

Esta propuesta modifica la estructura física vigente en `docs/architecture/domain-driven-architecture.md`. Dos procesos, dos superficies HTTP y la necesidad de seleccionar adapters por despliegue justifican ahora los packages backend. La documentación normativa debe actualizarse junto al refactor y las reglas de dependencia deberán protegerse con exports deliberados y, cuando exista tooling real, comprobaciones automáticas.

## Contratos y clientes

`packages/shared` seguirá siendo el package horizontal de contratos. Exportará raíces separadas:

- `PublicApi`: única superficie usada para generar el cliente público;
- `AdminApi`: única superficie administrativa;
- `ProxusApi`: composición para OpenAPI conjunto, tooling o tests cuando sea útil.

Los clientes frontend expondrán capacidades estrechas. El frontend administrativo podrá componer cliente público y administrativo cuando necesite una operación cuya semántica sea genuinamente pública; no se duplicarán rutas bajo `/admin` por simetría.

Separar clientes evita exposición accidental y mejora la interface, pero no es un control de seguridad: IAM, IAP, ingress y el backend siguen siendo la autoridad.

## Seguridad administrativa

Flujo cloud declarado para Admin:

```text
usuario del grupo configurado
  → Google Identity / Workspace
  → IAP directo de Cloud Run
  → frontend Admin + APIs sidecar
  → cookie opaca de Proxus
  → CurrentSubject
  → servicio y política RBAC
```

Controles implementados en IaC:

- el origen Cloud Run exige IAP y no recibe principals públicos;
- solo el service agent de IAP obtiene `run.invoker`;
- el principal humano es un grupo configurable, no un valor fijado en código;
- la imagen pública no sirve `AdminApi`; Admin compone explícitamente ambas imágenes backend porque su frontend necesita superficies pública y administrativa;
- production usa service accounts GCP separadas para runtime público y administrativo.

IAP no se convierte todavía en un `AdminPrincipal` de dominio ni sustituye la sesión/RBAC de producto. Tampoco hay usuarios PostgreSQL separados demostrados: ambos runtimes consumen actualmente el mismo Secret Manager ID. La auditoría de identidad IAP y los smoke tests de acceso siguen pendientes.

## Entornos y proyectos

La implementación actual usa un único proyecto GCP configurado, la región `europe-southwest1` y tres proyectos Pulumi sobre backend DIY:

| Programa | Proyecto | Stack |
| --- | --- | --- |
| Foundation | `proxus-foundation` | `foundation` |
| Production | `proxus-production` | `production` |
| Preview | `proxus-preview` | `pr-<number>` |

Production y preview referencian foundation mediante `organization/proxus-foundation/foundation`, que es la forma correcta para este backend DIY. El state está en `gs://proxus-v2-pulumi-state`, con versionado, uniform bucket-level access, public access prevention y cifrado de secretos mediante KMS en `europe-southwest1`. El bootstrap GCS/KMS queda fuera del stack que depende de él.

## Entornos efímeros por pull request

El lifecycle se vincula al PR, no a ramas arbitrarias:

```text
PR abierto/actualizado → crear o actualizar pr-<number>
PR cerrado             → destruir recursos y eliminar stack
reconciliación nocturna → destruir stacks huérfanos o expirados
```

La label exacta es `deploy-preview`. Solo autoriza un PR del mismo repositorio contra `main`, con aprobación vigente del SHA actual por owner/member/collaborator. La IaC con credenciales siempre procede de un SHA confiable de `main`; Cloud Build recibe por separado el SHA revisado del PR y se verifica su provenance.

Foundation comparte Artifact Registry, WIF e IAM. Cada stack `pr-<number>` declara:

```text
pr-123
├── identidad runtime
├── migration job
├── Cloud Run público: web + API pública
├── Cloud Run admin: admin web + API pública + API admin
├── IAP directo y principal de grupo configurable
└── outputs con URLs run.app protegidas
```

`pr-123` es solo un ejemplo de formato. No hay `preview-foundation`, Cloud SQL, DNS, wildcard ni load balancer por PR. La base Neon y la versión del secreto se preparan fuera de Pulumi; la IaC recibe un Secret Manager ID derivado de una plantilla configurable que contiene `{pr}`. Su alta/baja e independencia por PR son gates operativos pendientes, no garantías del programa actual.

Cada servicio preview limita Cloud Run a una instancia. Cerrar el PR o retirar la label destruye el stack; una reconciliación programada desde `main` elimina stacks sin PR abierto, same-repository, contra `main` y etiquetado. La limpieza de Neon y Secret Manager sigue fuera de este lifecycle.

## Imágenes y runtime

Cloud Build produce exactamente cuatro imágenes inmutables:

```text
proxus-server@sha256:...
proxus-admin-server@sha256:...
proxus-web@sha256:...
proxus-admin-web@sha256:...
```

El script valida que la provenance resuelva al SHA completo autorizado y obtiene los cuatro digests. Pulumi rechaza tags y recibe únicamente URIs regionales `@sha256`. Cloud Build no despliega ni accede a state o secretos runtime.

Los backends ejecutan JavaScript compilado con Node y sus entrypoints productivos PostgreSQL. El Dockerfile comprueba que el bundle no contenga PGlite, `PGLITE_DATA_DIR` ni `dev-server`. La web pública production se extrae de su imagen y se carga en un bucket GCS privado/versionado servido por Cloud CDN; Admin y los previews ejecutan sus frontends como sidecars Cloud Run.

## PostgreSQL externo y privilegios

Production declara identidades GCP separadas para runtime público, runtime administrativo y migraciones. Sin embargo, la implementación actual entrega a las tres el mismo Secret Manager ID de `DATABASE_URL`; no demuestra usuarios PostgreSQL DML/DDL separados. Preview usa una única identidad runtime para sus APIs y job.

Las APIs no aplican migraciones al arrancar y comprueban que no haya pendientes. El workflow converge primero el job, lo ejecuta y espera, y después crea los servicios. Separar credenciales de migración/runtime y automatizar bases/usuarios Neon por PR sigue pendiente antes de afirmar ese aislamiento.

## Pulumi y workflow de despliegue

Pulumi administra el estado deseado implementado:

- APIs necesarias y Artifact Registry en foundation;
- service accounts, IAM, WIF, IAP e ingress;
- IAM sobre secretos preexistentes en Secret Manager;
- Cloud Run services y jobs;
- bucket web privado, Cloud CDN, load balancing y outputs de production.

No administra Neon, versiones/valores de secretos, datasets/tablas BigQuery ni DNS.

GitHub Actions y scripts shell administran las operaciones ordenadas:

```text
validar identidad/SHA/configuración
→ construir/publicar cuatro imágenes con Cloud Build
→ verificar provenance y digests
→ converger identidades y migration job con Pulumi
→ ejecutar migraciones y esperar resultado
→ converger servicios de aplicación con Pulumi
→ publicar outputs o comentario del PR
```

Foundation no converge en cada despliegue. Los workflows implementados tampoco ejecutan todavía smoke tests de aplicación; son un gate manual pendiente.

Las migraciones no se modelarán como un recurso Pulumi que se repite por cambios incidentales. Pulumi declara el Cloud Run Job; el workflow lo ejecuta explícitamente y detiene el despliegue ante fallo.

Comandos implementados:

```bash
pnpm infra preview --environment foundation
pnpm infra preview --environment production
pnpm infra deploy --environment production
pnpm infra deploy --pr 123
pnpm infra destroy --pr 123
```

`123` es un placeholder. El wrapper solo permite `destroy` para previews. Los applies de production/preview no están autorizados operativamente mientras `APPLICATION_RUNTIME_READY` y los gates manuales descritos en el runbook no estén completos.

## Estrategia de migraciones y rollout

Secuencia implementada:

1. construir y publicar la imagen backend pública que contiene el comando de migración;
2. converger identidades y Cloud Run Job con servicios desactivados;
3. ejecutar el job y esperar éxito;
4. converger las revisiones pública y admin;
5. completar manualmente DNS/certificado en production;
6. ejecutar los smoke tests pendientes.

El job tiene una identidad GCP propia en production, pero hoy comparte el mismo secreto `DATABASE_URL`; no se afirma que tenga credenciales DDL exclusivas.

Las migraciones de producción deben seguir expand/migrate/contract cuando convivan revisiones antiguas y nuevas. Un rollback de aplicación no implica rollback automático de schema. La secuencia está implementada en workflow, pero no se ha ejecutado en cloud.

## Testing y verificaciones

Las suites existentes demuestran separación de superficies HTTP/composition roots, traducción segura de errores, autorización con sesión/RBAC y grafos Pulumi mockeados sin principals públicos. Los Dockerfiles comprueban al construir que el backend productivo no incluya PGlite/dev-server; Cloud Build verifica provenance y cuatro digests cuando se ejecuta.

Siguen pendientes pruebas cloud que demuestren:

- rechazo IAP inválido/ausente y ausencia de bypass directo;
- relación auditable entre identidad IAP y sesión/actor de producto;
- acceso público production, Admin y assets CDN con configuración real;
- creación, migración y limpieza de una base Neon preview;
- recuperación tras fallos Pulumi/migración y smoke tests;
- destrucción/reconciliación real del stack y limpieza de recursos externos.

Cada PR normal sigue ejecutando tests locales/PGlite. Un entorno efímero, cuando se habilite por primera vez, complementará y no sustituirá las suites deterministas. El gate PostgreSQL 17 actual y las pruebas de composición no equivalen a smoke tests del runtime cloud.

## Observabilidad y operación

La observabilidad objetivo, todavía no verificada en cloud, incluirá cuando aplique:

- entorno, revisión y digest de imagen;
- servicio público o administrativo;
- PR asociado en previews;
- identidad administrativa verificada en eventos de auditoría;
- ejecución y versión de migración;
- logs estructurados y correlation ID.

Siguen pendientes presupuestos, límites y alertas para Neon, conexiones, errores Cloud Run y acumulación de previews.

## Fases de adopción

### Fase completada: separación del backend

La separación física del backend y sus contratos ya está implementada.

1. Separar `PublicApi`, `AdminApi` y mantener la composición solo para tooling/tests.
2. Dividir handlers y routers públicos/administrativos dentro del runtime actual.
3. Extraer `@proxus/backend-domain` con servicios, reglas y repository ports de `study-catalog`.
4. Extraer `@proxus/backend-infra` con adapters, database, migraciones y seeds.
5. Crear `@proxus/backend-transport` y `@proxus/backend-admin-transport` con handlers separados.
6. Convertir `apps/server` en composition root exclusivamente público.
7. Crear `apps/admin-server` como composition root exclusivamente administrativo.
8. Adaptar el frontend admin para componer clientes público y administrativo cuando sea necesario.
9. Añadir tests positivos y negativos de superficies HTTP y composición.
10. Actualizar documentación normativa, scripts y diagnostics.

La separación de procesos está completada, pero no debe presentarse como despliegue cloud ni como integración de identidad IAP terminada. La autorización de producto sigue basándose en la sesión y RBAC documentados.

### IaC implementada y operación pendiente

11. Completado en código: builds Docker reproducibles de cuatro artefactos y verificación de provenance/digest.
12. Provisionado: backend GCS/KMS y foundation; 48 recursos sin cambios en el preview posterior registrado.
13. Completado en código, no desplegado: production, web GCS privada/CDN, IAP directo y principal de grupo configurable.
14. Completado en código, no desplegado: stacks `pr-<number>`, label lifecycle y reconciliación desde IaC confiable de `main`.
15. Pendiente: adapters reales email/Google, recursos/config externa Neon y secretos, datos analytics, DNS, revisión de privilegios de base y smoke tests.
16. Pendiente: aplicar y verificar production/previews. No se implementarán `development`, `staging` o `preview-foundation` sin una decisión posterior.

Cada fase debe conservar el flujo obligatorio:

```text
transport → service/use case → repository port → adapter
```

## Alternativas consideradas

### Un servidor con rutas públicas y admin

Más simple, pero impide eliminar la superficie administrativa del proceso público y reduce las opciones de aislamiento operativo.

### Dos servidores duplicando dominio

Rechazado: fragmenta reglas, tests y persistencia. La variación pertenece al transporte, identidad y composición.

### Terraform/OpenTofu

Maduro y predecible en GCP, pero introduce HCL y separa la orquestación del workspace TypeScript. Sigue siendo alternativa si Pulumi genera fricción operativa.

### SST

Permite componentes propios sobre Pulumi y buen workflow full-stack, pero GCP usa principalmente recursos raw y el backend remoto de state de SST requiere AWS o Cloudflare. Pulumi directo ofrece menos capas y state en GCS.

### Migraciones como `Command` o recurso Pulumi

Rechazado como mecanismo principal: una migración es una operación ordenada y parcialmente irreversible, no estado declarativo con semántica natural de create/update/delete.

### Cloud SQL por PR

Rechazado. La implementación seleccionó PostgreSQL externo en Neon. La IaC solo referencia Secret Manager; el lifecycle de base/usuario por PR sigue fuera de Pulumi y pendiente de operación segura.

## Riesgos y preguntas abiertas

- lifecycle y coste de Neon/Secret Manager para previews y conexiones con muchos PR simultáneos;
- recuperación y locking del backend DIY de Pulumi;
- política de retención de imágenes, stacks y bases de datos huérfanas;
- compatibilidad de migraciones durante rollouts graduales;
- separación real de credenciales DML/DDL;
- adaptación de autorización/auditoría de producto a la identidad IAP, hoy no implementada;
- smoke tests autenticados y rollback operativo de DNS/CDN/Cloud Run;
- riesgo de que los cuatro packages se conviertan en capas shallow y cómo preservar locality por bounded context;
- ownership temporal de object storage hasta que implemente un port real;
- reglas de exports y dependencias necesarias para impedir imports de infra desde transports o dominio.

## Criterios de aceptación de la propuesta

La propuesta se considerará validada cuando las revisiones adversariales no identifiquen un riesgo sin mitigación en:

1. seguridad e identidad IAP;
2. diseño DDD y dirección de dependencias;
3. operación Pulumi/GCS y recuperación;
4. Neon/Secret Manager, migraciones y previews;
5. costes, cuotas y limpieza;
6. testing, rollout y rollback.
