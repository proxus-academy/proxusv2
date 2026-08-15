# Infraestructura GCP y Alchemy

> **Estado:** fuente normativa de infraestructura
>
> **Última revisión:** 2026-08-13

## Alcance y estado real

La IaC activa vive en `@proxus/infra`, usa Alchemy TypeScript y fija `europe-southwest1` para los recursos regionales. Están implementados los entrypoints y workflows de `bootstrap`, `foundation`, `preview-platform`, `production` y previews `pr-<number>`.

El cutover a Alchemy está completado y autorizado: `foundation` converge 36 recursos sin cambios y `preview-platform` converge 8 recursos sin cambios. El export cifrado del writer anterior quedó archivado como evidencia de recuperación. Alchemy es el único writer; production y previews aún no se han provisionado ni validado con smoke tests.

## Stacks y state

| Stack Alchemy | Stage | Entrada | Estado |
| --- | --- | --- | --- |
| `bootstrap` | `bootstrap` | `infra/alchemy.bootstrap.ts` | backend adoptado; state local excepcional |
| `foundation` | `foundation` | `infra/alchemy.foundation.ts` | 36 recursos; convergencia sin cambios |
| `preview-platform` | `production` | `infra/alchemy.preview-platform.ts` | 8 recursos; convergencia sin cambios |
| `production` | `production` | `infra/alchemy.production.ts` | state GCS/KMS con lease; no aplicado |
| `preview` | `pr-<number>` | `infra/alchemy.preview.ts` | state GCS/KMS con lease; ninguno creado |

El seam de state guarda un documento cifrado por `(stack, stage)` en `alchemy-state/v2/<stack-codificado>/<stage-codificado>`. KMS cifra en cliente y GCS recibe ciphertext. El documento incluye recursos, outputs y lease; cada mutación usa precondición de generación GCS. Como GCS limita updates por objeto, state writes/deletes y mutaciones de lease comparten por documento un limitador process-wide que separa sus inicios al menos 1,1 s, respeta `Retry-After` en retries y espera antes del mutex CAS. El coste aceptado es latencia lineal (30 mutaciones requieren como mínimo unos 32 s entre primer y último inicio) para evitar 429 sistemáticos sin debilitar merge ni fencing. El lease externo contiene owner, ID no adivinable y expiración, se adquiere antes de iniciar Alchemy, se renueva durante la operación y se libera al terminar. Una identidad expirada o sustituida queda fenced. Al liberar tras destroy, el objeto se elimina con CAS de generación únicamente si el documento descifrado no tiene resources, output ni lease; el listado también filtra documentos vacíos históricos. Una carrera o takeover obliga a releer y nunca puede podar state no vacío o de otro writer. No se borran locks ni generaciones manualmente.

`ALCHEMY_STATE_BUCKET` y `ALCHEMY_STATE_KMS_KEY` identifican el backend. El bucket `gs://proxus-v2-pulumi-state` y los IDs KMS `pulumi-state/pulumi-secrets` son identificadores físicos legacy conservados deliberadamente para evitar reemplazos; no indican el writer actual. Mantiene versionado, uniform bucket-level access y public access prevention, sin retention lock.

Bootstrap usa state local bajo `.alchemy/state/bootstrap/` porque crea o adopta el backend. Sus recursos tienen retención/protección física y no admiten destroy.

## Foundation y adopción

Foundation declara APIs, Artifact Registry regional con tags inmutables, cuentas separadas de build/deploy, WIF separado para production y preview, e IAM mínimo y aditivo. También declara y retiene el bucket físico de source upload de Cloud Build (por defecto `${projectId}_cloudbuild`, ubicación `US`, ambos configurables) y concede únicamente al executor `proxus-cloud-build` `roles/storage.objectViewer` mediante un member aditivo en ese bucket; no concede por ello Storage Admin ni acceso Storage a nivel de proyecto. El preview deployer recibe `roles/serviceusage.serviceUsageAdmin` para habilitar la API SQL del stack preview-platform y `roles/cloudsql.admin` para administrar exclusivamente mediante sus recursos IaC la instancia compartida y las databases/users de preview; no recibe Storage Admin ni Owner. El bucket de state concede `roles/storage.objectAdmin` y `roles/storage.legacyBucketReader`, y la CryptoKey `roles/cloudkms.cryptoKeyEncrypterDecrypter`, a los deployers foundation, production y preview identificados por configuración. No declara secretos runtime, versiones de secretos, datos de aplicación, DNS ni principals humanos.

Los IDs físicos están fijados para evitar duplicados, incluido el bucket source de Cloud Build. La adopción ya completada no autoriza renombrarlos ni recrearlos: ante una incompatibilidad de labels, descripciones u otros ownership markers hay que detenerse. El export cifrado previo al cutover se conserva fuera del repositorio como backup histórico; no es state operativo ni autoriza otro writer.

## Builds, runtimes y datos

Cloud Build solo construye y publica cuatro imágenes (`proxus-server`, `proxus-admin-server`, `proxus-web`, `proxus-admin-web`). Verifica que provenance resuelva al SHA completo autorizado y entrega URIs Artifact Registry `@sha256`; no recibe state ni secretos runtime y no despliega. Los backends usan Node/PostgreSQL productivo, nunca `apps/dev-server` ni PGlite.

Production declara identidades pública, administrativa y de migración, job de migración, API pública detrás de HTTPS LB, web en bucket privado con CDN y Admin multi-container con IAP directo. Los roles Cloud SQL de esas identidades y de previews usan el provider interno aditivo `ProjectIamMember`: opera por `projectId`, lee y escribe la policy v3 completa con `etag`, preserva bindings condicionados, adopta grants existentes y falla cerrado si no puede leer IAM. Las mutaciones IAM de proyecto, dataset BigQuery y secreto se serializan por recurso dentro del proceso; ante un conflicto CAS hacen como máximo cuatro ciclos completos de relectura, merge y escritura. Los 403 y demás errores permanentes no se reintentan, y los diagnósticos solo conservan operación, recurso lógico, status/código y mensaje acotado y redactado. DNS es manual. El workflow converge primero el job, lo ejecuta y espera, y después converge servicios.

`preview-platform` declara la plataforma Cloud SQL compartida, los contenedores metadata de Secret Manager `preview-auth-google-signing`, `preview-object-storage-signing`, `preview-mailgun-api-key` y `preview-database-bootstrap-password` (sin versiones ni payloads), y el dataset/tabla BigQuery `proxus-v2.preview_product_analytics.events` en `europe-southwest1`, protegidos contra borrado. Su schema reproduce el envelope que inserta el adapter real. Cada preview declara base y usuarios IAM separados para runtime/migración, una identidad exclusiva del job de bootstrap con `secretAccessor` solo sobre el password de bootstrap, job de bootstrap de privilegios, job de migración y dos Cloud Run con IAP y máximo una instancia. El workflow ejecuta bootstrap, luego migración y después servicios. El bootstrap usa Cloud SQL Connector `PASSWORD` con el usuario BUILT_IN estable `proxus_preview_bootstrap`; ese usuario se crea fuera de Alchemy y su password existe solo como versión de Secret Manager, nunca en config/state/output/URL/log. Migración y runtime continúan usando IAM. El bootstrap conserva los grants y cambios de ownership que puede realizar, pero no altera default privileges de la identidad de migración: el ejecutable de migración, autenticado como esa identidad y con `DATABASE_RUNTIME_ROLE` explícito, aplica después de las migraciones y en una transacción los grants DML/sequences y default privileges idempotentes para runtime en `public` y `drizzle`, revocándolos de `PUBLIC`. El object storage de preview, mientras no exista bucket dedicado, usa explícitamente el adapter local con `OBJECT_STORAGE_LOCAL_ROOT=/tmp/proxus-object-storage`: `/tmp` es writable en Cloud Run, pero los objetos son efímeros, no persisten tras reinicios y están aislados por instancia. El límite `maxInstances: 1` evita divergencia entre varias instancias, pero no aporta persistencia ni comparte objetos entre los servicios public y admin. Production conserva su configuración sin cambios. Cierre/unlabel destruye el stack; el reconciliador elimina stages huérfanos. No hay DNS/LB por PR.

Los payloads de Secret Manager quedan fuera de Alchemy. Production recibe IDs/versiones externas para base, firma, object storage y Mailgun; analytics, dominio, remitente, bucket web y principal de acceso IAP son configuración operativa. Plan/state/output no deben contener passwords, API keys ni payloads secretos.

## Confianza CI y gates

Los workflows implementados son `deploy-bootstrap.yml`, `deploy-foundation.yml`, `deploy-preview-platform.yml`, `deploy-production.yml`, `deploy-preview.yml` y `reconcile-previews.yml`. Usan IaC confiable de `main`, WIF y environments protegidos. Bootstrap comparte el environment y la concurrency de foundation; su state local es excepcional, efímero y no se persiste por el workflow. En previews, `pull_request_target` solo decide política; se revalidan repositorio, base `main`, label `deploy-preview`, SHA y aprobación vigente antes de obtener credenciales. El SHA revisado del PR solo se entrega a Cloud Build.

`APPLICATION_RUNTIME_READY=true` es una afirmación operacional, no un bypass. Debe permanecer cerrado hasta verificar secretos y datos externos, Mailgun, adapter Google, Cloud SQL/IAM y grants, cuatro imágenes/provenance, principal de acceso IAP, dominio/bucket/DNS de production, migraciones, cleanup preview y smoke tests autenticados de IAP/API/CDN/Cloud Run.

Reglas obligatorias:

- sin claves JSON, `allUsers`, `allAuthenticatedUsers` ni secretos en config/state;
- IAM aditivo y deployers/WIF separados;
- plan revisado antes de cada deploy; nunca interpretar tests mock como preview cloud;
- no `destroy` de bootstrap, foundation o production;
- no editar state ni el lease, saltarse gates o ejecutar writers concurrentes;
- cambios de state, IAM, WIF, APIs, región, lifecycle o confianza CI actualizan esta norma y el [runbook](../runbooks/gcp-alchemy.md).
