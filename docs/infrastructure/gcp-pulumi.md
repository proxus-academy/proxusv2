# Infraestructura GCP y Pulumi

> **Estado:** normativa de infraestructura
>
> **Última revisión:** 2026-08-13

## Alcance y estado real

La IaC vive en el workspace `@proxus/infra` y fija `europe-southwest1` como región de Cloud Run, Artifact Registry, Cloud Build y KMS. Hay tres proyectos Pulumi sobre el backend DIY GCS:

| Programa | Proyecto Pulumi | Stack | Referencia DIY |
| --- | --- | --- | --- |
| `infra/foundation` | `proxus-foundation` | `foundation` | `organization/proxus-foundation/foundation` |
| `infra/production` | `proxus-production` | `production` | `organization/proxus-production/production` |
| `infra/preview` | `proxus-preview` | `pr-<number>` | `organization/proxus-preview/pr-<number>` |

Production y preview consumen foundation mediante la referencia exacta `organization/proxus-foundation/foundation`; no deben sustituirla por una referencia Pulumi Cloud ni omitir el segmento `organization` del backend DIY.

A fecha de esta revisión, solo se ha provisionado el plano foundation, incluido su bootstrap previo de state. Un preview posterior de foundation mostró **48 recursos sin cambios**. Los programas y workflows de production y preview están implementados en el repositorio, pero no se han aplicado: no se han creado por ellos Cloud Run, jobs, imágenes, CDN, bucket web, stacks `pr-<number>` ni recursos de aplicación. Este estado observado no acredita despliegue ni smoke tests de esas superficies.

## State GCS y cifrado KMS

El backend es `gs://proxus-v2-pulumi-state`. El bucket usa versionado, uniform bucket-level access y public access prevention. No lleva retention lock porque Pulumi necesita administrar sus locks; el versionado conserva generaciones para recuperación.

Los secretos del state se cifran con:

```text
gcpkms://projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state/cryptoKeys/pulumi-secrets
```

La clave rota cada 90 días. El bucket y la clave no pueden pertenecer al stack que depende de ellos. `infra/scripts/bootstrap-state.sh` es el único bootstrap imperativo aprobado: crea lo que falte y converge estas protecciones sin eliminar recursos.

## Foundation compartida

Foundation declara:

- las APIs GCP requeridas;
- un Artifact Registry Docker regional con tags inmutables;
- identidades separadas para ejecutar Cloud Build, enviar builds y desplegar production/preview;
- pools y providers WIF separados para production y preview;
- IAM compartido y acceso de los deployers al backend GCS y a la clave KMS.

Todos sus recursos están protegidos con `protect`. Las APIs usan `disableOnDestroy: false` y `disableDependentServices: false`. Foundation no crea secretos runtime, bases Neon, datasets/tablas BigQuery, dominios ni principals humanos.

## Builds e imágenes inmutables

Cloud Build **solo construye y publica**. No recibe acceso al state, a secretos runtime, a Cloud Run ni a identidades runtime, y no ejecuta Pulumi. El build produce exactamente cuatro imágenes:

- `proxus-server`;
- `proxus-admin-server`;
- `proxus-web`;
- `proxus-admin-web`.

`infra/scripts/build-images.sh` exige un SHA Git completo, envía esa revisión exacta, comprueba `sourceProvenance.resolvedRepoSource.commitSha` y extrae un digest válido para cada una. Pulumi acepta únicamente URIs regionales de Artifact Registry con `@sha256:...`; los tags no son un contrato de despliegue.

Los backends de producción son bundles Node compilados. El Dockerfile rechaza referencias a `dev-server`, PGlite y sus variables/adapters. Production y previews usan los entrypoints productivos con PostgreSQL; nunca despliegan `apps/dev-server` ni PGlite.

## Runtime production

El programa production declara tres identidades runtime —pública, administrativa y migraciones— y un Cloud Run Job de migración. El workflow converge primero el job con `deployServices=false`, lo ejecuta y solo después habilita servicios.

Cuando `deployServices=true`:

- la API pública es un Cloud Run con ingress desde el load balancer interno/gestionado y se publica bajo `/api` mediante un HTTPS load balancer externo; el URL map elimina ese prefijo antes de reenviar al router HTTP, igual que los proxies frontend;
- la web pública se extrae de su imagen inmutable y se carga en un bucket GCS privado, versionado y con public access prevention; Cloud CDN lo lee mediante su service identity, no mediante un principal público;
- Admin es un servicio Cloud Run multi-container (`admin-web`, API pública y API administrativa) protegido por **IAP directo de Cloud Run**;
- únicamente el service agent de IAP recibe `run.invoker`, y el acceso IAP se concede al principal de grupo configurable con formato `group:<dirección>`;
- los recursos persistentes relevantes usan deletion protection o `protect`, y no se ofrece `destroy` para production.

El dominio, bucket web y grupo IAP son configuración operativa. No se documenta ningún valor ficticio como real. Pulumi devuelve la IP para que DNS se cree o actualice manualmente; no administra la zona DNS.

## Runtime de previews

Cada stack `pr-<number>` declara una identidad runtime, un job de migración y, tras migrar, dos servicios Cloud Run con máximo una instancia:

- preview público: `proxus-web` + API pública;
- preview admin: `proxus-admin-web` + API pública + API administrativa.

Ambos servicios usan IAP directo y el mismo principal de grupo configurable. No se crean DNS, certificados ni load balancers por PR. El número de PR debe coincidir con el nombre del stack.

El lifecycle requiere la label `deploy-preview`. Solo se acepta un PR abierto contra `main`, del mismo repositorio, cuyo SHA actual tenga aprobación vigente de owner/member/collaborator. `pull_request_target` obtiene únicamente política y metadatos: tras autenticarse, los jobs con credenciales hacen checkout de IaC desde el SHA confiable de `main`; Cloud Build recibe por separado el SHA revisado del PR. Después de cada posible espera del environment protegido y antes de obtener credenciales de build o deploy se vuelven a comprobar label, SHA y aprobación para rechazar operaciones e imágenes obsoletas. El destroy también comprueba, antes de autenticarse, que el PR no haya vuelto a abrirse con la label.

Cerrar el PR o retirar la label destruye `pr-<number>`. La reconciliación programada, ejecutada también desde IaC confiable de `main`, enumera solo stacks con ese patrón y destruye los que ya no correspondan a un PR abierto, same-repository, basado en `main` y etiquetado. Todos esos caminos comparten una única concurrency group y no cancelan una operación en curso.

## Datos y secretos externos

La IaC no provisiona Neon ni inventa URLs, passwords o nombres de bases. Recibe únicamente IDs de Secret Manager:

- production: `NEON_PRODUCTION_DATABASE_SECRET_ID`;
- preview: `NEON_PREVIEW_DATABASE_SECRET_ID_TEMPLATE`, que debe contener `{pr}`.

La versión `latest` de cada secreto de base debe contener el `DATABASE_URL` preparado fuera de Pulumi. Los secretos y versiones deben existir antes del stack; sus valores nunca se pasan por config Pulumi ni por outputs. La API key de Mailgun sigue el mismo patrón: `MAILGUN_API_KEY_SECRET_ID` identifica el secreto y los runtimes reciben su versión `latest`; dominio y remitente son variables no secretas obligatorias. También son externos los secretos de firma, el dataset/tabla de analytics y su lifecycle.

Actualmente una misma referencia de secreto de base se concede a los runtimes y al job de migración de cada entorno. La separación de credenciales DML/DDL, la creación/destrucción de bases Neon por PR y la limpieza del secreto externo siguen pendientes; no debe afirmarse aislamiento o revocación que el programa aún no implementa.

## Reglas de seguridad y cambio

- No se crean ni almacenan claves JSON de service account.
- No se permiten `allUsers` ni `allAuthenticatedUsers`.
- IAM usa recursos member no autoritativos para no borrar bindings ajenos.
- Production y preview usan pools WIF y deployers separados.
- WIF restringe repositorio, GitHub environment y `workflow_ref` exacto en `refs/heads/main`.
- El código de un PR no obtiene credenciales ni decide la IaC ejecutada.
- `applicationRuntimeReady=true` es una afirmación operacional explícita, no un bypass. Debe permanecer desactivada mientras falten la validación real de Mailgun, el adapter Google, secretos, datos, permisos, DNS o smoke tests.
- No usar `--target`, `--refresh=false`, `--skip-preview`, edición manual de state ni `pulumi cancel` salvo recuperación documentada.
- No ejecutar `destroy` sobre foundation o production ni retirar protección para limpiar.

Antes de cualquier apply debe ejecutarse y revisarse `pulumi preview --diff`. Cambios a state, IAM, WIF, APIs, región, pines, lifecycle, confianza CI o contratos de configuración deben actualizar este documento y [`../runbooks/gcp-pulumi.md`](../runbooks/gcp-pulumi.md) en el mismo cambio.
