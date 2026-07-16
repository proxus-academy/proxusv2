# Separación de APIs y despliegue con Pulumi

> **Estado:** propuesta para revisión adversarial  
> **Alcance:** backend, contratos HTTP, seguridad administrativa, infraestructura y entornos  
> **Fecha:** 2026-07-16

## Resumen

Proxus desplegará la API pública y la API administrativa como procesos e imágenes Docker independientes. Ambos procesos reutilizarán los mismos servicios de aplicación y ports de dominio, pero montarán contratos HTTP distintos y seleccionarán sus adapters mediante Layers en composition roots mínimos.

La infraestructura se declarará con Pulumi y TypeScript. Un workflow de despliegue TypeScript, potencialmente modelado con Effect y Pulumi Automation API, coordinará las operaciones que no son estado declarativo, especialmente migraciones, verificaciones y promoción de revisiones.

La plataforma inicial será Google Cloud:

- Cloud Run para `server` y `admin-server`;
- Cloud SQL for PostgreSQL;
- Artifact Registry para imágenes;
- Secret Manager para secretos runtime;
- IAM e IAP para restringir el acceso administrativo;
- GCS como backend del state de Pulumi;
- entornos persistentes `development`, `staging` y `production`;
- entornos efímeros `pr-<number>` bajo demanda.

## Motivación

Actualmente un único servidor monta grupos HTTP públicos y administrativos. Esto impide aplicar políticas operativas fuertes por audiencia sin que el proceso público conozca las rutas administrativas.

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

Flujo objetivo:

```text
usuario administrativo
  → Google Identity / Workspace
  → IAP
  → HTTPS Load Balancer
  → Cloud Run admin con ingress restringido
  → validación de identidad IAP
  → AdminPrincipal
  → servicio y política de autorización
```

Requisitos:

- `admin-server` no permite invocación anónima;
- el origen directo de Cloud Run no puede saltarse IAP;
- solo identidades técnicas explícitas tienen `run.invoker`;
- no se confía en headers de identidad si la petición no procede del camino protegido;
- cada mutación registra una identidad administrativa verificable;
- IAM/IAP autentican acceso; el dominio conserva autorización por operación cuando existan roles o scopes;
- Public y Admin usan service accounts y usuarios PostgreSQL distintos;
- la imagen pública no monta ni sirve `AdminApi`, y viceversa salvo una excepción documentada.

## Entornos y proyectos

Entornos persistentes:

- `development`;
- `staging`;
- `production`.

Se recomienda un proyecto GCP por entorno para aislar IAM, secretos, cuotas, Cloud SQL y eliminación accidental. Un proyecto de infraestructura compartida puede alojar Artifact Registry y el bucket de state si la política organizativa lo permite.

El state se almacena en un bucket GCS previamente inicializado:

```bash
pulumi login gs://proxus-pulumi-state
```

El bucket tendrá versionado, uniform bucket-level access, public access prevention, auditoría y permisos limitados a CI y operadores. Su bootstrap queda fuera del stack que almacena en él su propio state.

## Entornos efímeros por pull request

El lifecycle se vincula al PR, no a ramas arbitrarias:

```text
PR abierto/actualizado → crear o actualizar pr-<number>
PR cerrado             → destruir recursos y eliminar stack
reconciliación nocturna → destruir stacks huérfanos o expirados
```

Se empezará bajo una label explícita, por ejemplo `deploy-preview`, para controlar coste y cuotas.

### Infraestructura compartida de previews

```text
preview-foundation
├── Artifact Registry
├── DNS y certificado wildcard
├── perímetro/load balancer/IAP
├── instancia Cloud SQL no productiva
└── políticas y observabilidad comunes
```

### Recursos aislados por PR

```text
pr-123
├── servicios Cloud Run public/admin
├── base de datos PostgreSQL propia
├── usuario PostgreSQL propio
├── secretos propios
├── migration job
├── frontends cuando corresponda
└── outputs y URLs del preview
```

No se creará una instancia Cloud SQL por PR inicialmente. Cada preview tendrá una base de datos, no solo un schema, dentro de una instancia compartida de previews. Nunca se copiarán automáticamente datos de producción; se usarán seeds sintéticos.

Los servicios preview tendrán límites bajos de instancias y pool para proteger conexiones y cuotas. La destrucción debe ser idempotente y existir una limpieza periódica independiente de los eventos de GitHub.

## Imágenes y runtime

Se producirán al menos dos imágenes inmutables:

```text
proxus-server@sha256:...
proxus-admin-server@sha256:...
```

Podrán compartir un Dockerfile multi-stage con targets distintos, pero tendrán entrypoints y superficies HTTP diferentes. El artefacto de producción ejecutará JavaScript compilado con Node; no dependerá de `tsx`, fuentes completas ni devDependencies.

Las imágenes se construyen y publican en CI. Pulumi recibe sus digests y declara qué revisión debe ejecutar cada servicio. Pulumi no debe ocultar builds Docker no reproducibles dentro de una actualización de infraestructura.

## Cloud SQL y privilegios

Cada entorno persistente tendrá su propia instancia o aislamiento equivalente aprobado. Como mínimo existirán identidades separadas:

- runtime público;
- runtime administrativo;
- migraciones.

Solo la identidad de migraciones tendrá permisos DDL. Las APIs no aplicarán migraciones al arrancar; pueden fallar readiness si detectan migraciones pendientes.

En previews, una instancia compartida contendrá una base de datos y usuario por PR. Se impondrán límites de conexiones por servicio y un máximo bajo de instancias Cloud Run.

## Pulumi y workflow de despliegue

Pulumi administra estado deseado:

- proyectos y APIs necesarias;
- Artifact Registry;
- Cloud SQL, bases de datos y usuarios cuando corresponda;
- Secret Manager;
- service accounts, IAM, IAP e ingress;
- Cloud Run services y jobs;
- DNS, load balancing y outputs.

Un workflow TypeScript administra operaciones ordenadas:

```text
validar
→ construir/publicar imágenes
→ converger foundation con Pulumi Automation API
→ crear/actualizar migration job
→ ejecutar migraciones y esperar resultado
→ converger servicios de aplicación
→ ejecutar smoke tests
→ publicar outputs o comentario del PR
```

Las migraciones no se modelarán como un recurso Pulumi que se repite por cambios incidentales. Pulumi declara el Cloud Run Job; el workflow lo ejecuta explícitamente y detiene el despliegue ante fallo.

El workflow puede usar Effect para errores tipados, timeout, logging y cleanup. No se envolverá cada llamada en un servicio hipotético; solo se crearán seams donde existan sustitución o tests reales.

Comandos objetivo:

```bash
pnpm infra preview --environment staging
pnpm infra deploy --environment staging
pnpm infra deploy --pr 123
pnpm infra destroy --pr 123
```

## Estrategia de migraciones y rollout

Secuencia inicial:

1. provisionar infraestructura necesaria;
2. publicar imagen de migraciones o seleccionar el comando del artefacto backend;
3. ejecutar Cloud Run Job con identidad DDL;
4. esperar éxito y registrar ejecución;
5. desplegar nuevas revisiones pública y admin;
6. ejecutar smoke tests;
7. promocionar tráfico cuando la plataforma lo requiera.

Las migraciones de producción deben seguir expand/migrate/contract cuando convivan revisiones antiguas y nuevas. Un rollback de aplicación no implica rollback automático de schema.

## Testing y verificaciones

Se añadirán pruebas para demostrar:

- `server` no sirve rutas administrativas;
- `admin-server` no sirve rutas públicas no declaradas;
- ambos composition roots arrancan con Layers de test;
- los dos transports traducen los mismos errores de dominio de forma segura;
- la identidad IAP inválida o ausente se rechaza;
- la identidad verificada llega al servicio y a auditoría;
- la API pública permanece accesible sin identidad administrativa;
- una base de datos preview empieza limpia, migra y se destruye;
- el workflow reanuda correctamente tras fallos en Pulumi, migración o smoke tests;
- el cierre de PR elimina recursos y la reconciliación detecta huérfanos;
- las imágenes contienen solo el transporte esperado.

Cada PR normal seguirá ejecutando tests locales/PGlite. El entorno efímero complementa, no sustituye, las suites deterministas. Los tests PostgreSQL y de composición se ejecutarán antes de promover a staging.

## Observabilidad y operación

Cada petición y despliegue incluirá, cuando aplique:

- entorno, revisión y digest de imagen;
- servicio público o administrativo;
- PR asociado en previews;
- identidad administrativa verificada en eventos de auditoría;
- ejecución y versión de migración;
- logs estructurados y correlation ID.

Se definirán presupuestos, límites y alertas para Cloud SQL, conexiones, errores Cloud Run y acumulación de previews.

## Fases de adopción

### Fase inmediata: separación del backend

Esta es la única fase aprobada para implementación por ahora. No incluye Docker, Pulumi, GCP, IAP ni previews.

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

Durante esta fase, las rutas administrativas conservan temporalmente la política de acceso documentada actualmente. La separación de procesos no debe presentarse como autenticación terminada ni desplegarse públicamente como segura.

### Fases posteriores, fuera del refactor inmediato

11. Crear builds Docker reproducibles.
12. Crear backend GCS y programa Pulumi mínimo.
13. Incorporar IAM/IAP y cerrar la excepción temporal de acceso administrativo.
14. Desplegar `development`, después `staging` y finalmente `production`.
15. Añadir `preview-foundation` y previews por label.
16. Incorporar workflow TypeScript/Automation API, migraciones y reconciliación.

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

Rechazado inicialmente por coste, latencia de provisión y cuotas. Se usará base de datos por PR sobre una instancia preview compartida.

## Riesgos y preguntas abiertas

- coste y complejidad de load balancing/IAP para previews;
- límites de Cloud SQL y conexiones con muchos PR simultáneos;
- estrategia exacta de build/push y autenticación CI mediante Workload Identity Federation;
- ownership y bootstrap del bucket GCS de state;
- recuperación y locking del backend DIY de Pulumi;
- política de retención de imágenes, stacks y bases de datos huérfanas;
- compatibilidad de migraciones durante rollouts graduales;
- si Artifact Registry debe ser compartido o por proyecto;
- si development necesita recursos persistentes completos o puede reutilizar preview foundation;
- mecanismo exacto de autorización y auditoría posterior a IAP;
- riesgo de que los cuatro packages se conviertan en capas shallow y cómo preservar locality por bounded context;
- ownership temporal de object storage hasta que implemente un port real;
- reglas de exports y dependencias necesarias para impedir imports de infra desde transports o dominio.

## Criterios de aceptación de la propuesta

La propuesta se considerará validada cuando las revisiones adversariales no identifiquen un riesgo sin mitigación en:

1. seguridad e identidad IAP;
2. diseño DDD y dirección de dependencias;
3. operación Pulumi/GCS y recuperación;
4. Cloud SQL, migraciones y previews;
5. costes, cuotas y limpieza;
6. testing, rollout y rollback.
