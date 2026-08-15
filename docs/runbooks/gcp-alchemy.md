# Runbook: GCP y Alchemy

Este es el procedimiento operativo vigente. No autoriza nuevos despliegues: cada deploy, migración, DNS y smoke test requiere aprobación explícita. El cutover está completado: foundation converge 36 recursos sin cambios y preview-platform 8 sin cambios. Alchemy es el único writer.

## Prerrequisitos y contexto

- `gcloud` con operador autorizado, nunca una clave JSON;
- Node `22.22.2`, Corepack `0.35.0`, pnpm `10.32.1` y dependencias frozen;
- `jq` disponible en `PATH`; es un binario externo obligatorio tanto para `build-images.sh` y los workflows como para los tests de provenance de `@proxus/infra` (Knip lo registra como prerrequisito del workspace, no como dependencia npm); región `europe-southwest1`;
- variables GCP, WIF y de state configuradas según el workflow/entrypoint.

```bash
gcloud auth list --filter=status:ACTIVE
gcloud config get-value project
git status --short
pnpm --filter @proxus/infra typecheck
pnpm --filter @proxus/infra test
```

La CLI normativa es:

```bash
pnpm --filter @proxus/infra alchemy:infra -- plan --stage <bootstrap|foundation|preview-platform|production>
pnpm --filter @proxus/infra alchemy:infra -- deploy --stage <...>
pnpm --filter @proxus/infra alchemy:infra -- outputs --stage <...>
pnpm --filter @proxus/infra alchemy:infra -- plan --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- deploy --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- outputs --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- destroy --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- list-preview-stages
```

El wrapper bloquea destroy de bootstrap/foundation/production/preview-platform, adquiere y renueva el lease GCS para stacks remotos, inyecta el fence al child y lo libera al terminar. `outputs` lee state bajo lease. Las mutaciones del único objeto de cada stage se espacian al menos 1,1 s dentro del proceso; por ello los plans/deploys con muchas escrituras tardan aproximadamente 1,1 s por mutación, más backoff/`Retry-After`, y no deben acelerarse lanzando writers paralelos. Revisar siempre `plan` inmediatamente antes de `deploy`.

## Bootstrap

Configurar `GCP_PROJECT_ID`, `GCP_REGION`, `ALCHEMY_STATE_BUCKET`, `ALCHEMY_STATE_KEY_RING_ID`, `ALCHEMY_STATE_CRYPTO_KEY_ID` y `GCP_OPERATOR_PRINCIPAL`.

```bash
pnpm --filter @proxus/infra alchemy:infra -- plan --stage bootstrap
# Solo recursos realmente nuevos y tras aprobación:
pnpm --filter @proxus/infra alchemy:infra -- deploy --stage bootstrap
# Para IDs físicos preexistentes, solo tras revisar la adopción:
pnpm --filter @proxus/infra alchemy:infra -- deploy --stage bootstrap --adopt
pnpm --filter @proxus/infra alchemy:infra -- outputs --stage bootstrap
```

Bootstrap usa `.alchemy/state/bootstrap/`, no lease remoto. El workflow manual protegido `deploy-bootstrap.yml` autoriza el SHA exacto de `main` antes de WIF, comparte environment/concurrency con foundation y exige confirmación textual para deploy y otra confirmación para `--adopt`. Los inputs de bucket, KeyRing y CryptoKey son IDs físicos: revisarlos contra el inventario y el registro archivado del cutover antes de adoptar. El workflow solo muestra los outputs allowlisted `bucket` y `key`; no publica el documento de state ni otros outputs.

El runner y `.alchemy/state/bootstrap/` son efímeros: el workflow **no persiste ni promete recuperar ese state local**. Para una ejecución posterior sobre recursos ya existentes hay que repetir el procedimiento como readopción explícita de exactamente los mismos IDs físicos: congelar cualquier writer, recopilar evidencia/inventario, ejecutar primero `plan`, revisar que no existan reemplazos o duplicados y solo entonces ejecutar `deploy` con `adoptExisting=true` y ambas confirmaciones. Si una ejecución falla después de mutar cloud pero antes de outputs, no asumir que no hubo cambios: inspeccionar bucket/KMS por sus IDs físicos, conservar logs y volver a aplicar el mismo procedimiento de readopción; nunca editar/reconstruir a mano el state ni cambiar IDs para crear copias.

El bucket y KMS ya adoptados conservan sus IDs físicos legacy; no ejecutar `--adopt` como simple comprobación. Verificar versionado, UBLA, public access prevention, rotación y IAM mínimo con `gcloud storage buckets describe` y `gcloud kms keys describe`. No renombrar, añadir retention lock ni borrar físicamente bucket/KeyRing/CryptoKey. Bootstrap jamás se destruye desde el workflow o el wrapper.

## Foundation: operación tras el cutover

Además de state (`ALCHEMY_STATE_BUCKET`, resource name completo `ALCHEMY_STATE_KMS_KEY`), configurar proyecto/número/display name/parent, región, `GITHUB_REPOSITORY` y el deployer foundation privado (`GCP_FOUNDATION_DEPLOYER_SERVICE_ACCOUNT`; el workflow deriva `GCP_FOUNDATION_DEPLOYER_PRINCIPAL=serviceAccount:<email>`). El bucket de source upload usa `GCP_CLOUD_BUILD_SOURCE_BUCKET` (por defecto `${GCP_PROJECT_ID}_cloudbuild`) y `GCP_CLOUD_BUILD_SOURCE_BUCKET_LOCATION` (por defecto `US`); antes del plan deben coincidir con el bucket físico existente. El principal debe tener acceso inicial al backend por el bootstrap/adopción autorizada; foundation conserva de forma aditiva para foundation, production y preview `storage.objectAdmin` + `storage.legacyBucketReader` sobre el bucket y `cloudkms.cryptoKeyEncrypterDecrypter` sobre la clave.

El cutover autorizado adoptó los recursos existentes. Foundation converge 36 recursos sin cambios; su export cifrado previo quedó archivado fuera del repositorio como evidencia/backup. No se restaura como state activo ni se habilita ningún writer alternativo.

Antes de una operación nueva, ejecutar y revisar:

```bash
pnpm --filter @proxus/infra alchemy:infra -- plan --stage foundation --adopt-existing false
```

Confirmar IDs físicos, ausencia de duplicados, IAM/WIF y compatibilidad de ownership markers. El plan debe mostrar `roles/storage.objectViewer` solo como member aditivo bucket-level para `proxus-cloud-build`, nunca como grant de proyecto ni `roles/storage.admin`. Si aparece una adopción, reemplazo o cambio inesperado, detenerse; no cambiar IDs ni desplegar. Verificar además Artifact Registry, bucket source, cuentas sin user-managed keys y grants acotados de state.

El workflow manual `deploy-foundation.yml` conserva el input de adopción para recuperación controlada; no debe usarse en operación normal.

## GitHub y gates runtime

Crear/proteger los environments usados por los workflows y cargar outputs no secretos de foundation, proyecto, providers WIF, deployers, state bucket/KMS y configuración específica. No guardar exports en el repositorio.

Antes de activar `APPLICATION_RUNTIME_READY=true`, verificar como mínimo:

1. Mailgun real (dominio/remitente/API key externa) y adapter Google;
2. cuatro imágenes por digest con provenance del SHA autorizado;
3. Secret Manager, analytics y permisos efectivos;
4. Cloud SQL/IAM DB auth, usuarios/grants separados, bootstrap y migraciones;
5. principal `IAP_ACCESS_PRINCIPAL` real, exclusivamente `user:<email>` o `group:<email>`; mientras se habilita el grupo operativo, usar temporalmente `user:javier@proxus.es` en futuras operaciones cloud;
6. dominio, bucket web único y plan DNS de production;
7. readiness, rollback operativo y smoke autenticado IAP/API/CDN/Cloud Run;
8. lifecycle y limpieza de bases/usuarios preview.

IDs de Secret Manager no son payloads. Nunca poner URLs con password, API keys o versiones secretas en variables que Alchemy persista.

## Preview platform

`deploy-preview-platform.yml` es manual y usa el environment protegido correspondiente. Con configuración y gates revisados:

```bash
pnpm --filter @proxus/infra alchemy:infra -- plan --stage preview-platform
pnpm --filter @proxus/infra alchemy:infra -- deploy --stage preview-platform
pnpm --filter @proxus/infra alchemy:infra -- outputs --stage preview-platform
```

Su stack es `preview-platform` y su stage interno es `production`. Sus outputs no secretos fijan los cuatro IDs de contenedor Secret Manager y `preview_product_analytics.events`; configura los previews con esos IDs (y `proxus-v2` como proyecto analytics), nunca con payloads o versiones. Debe existir y verificarse antes del primer preview. El cutover está verificado con 8 recursos y convergencia sin cambios.

Después de desplegar el contenedor (que nace sin versión), un operador autorizado crea una sola vez el usuario BUILT_IN estable fuera de Alchemy. No usar `--password=...`, variables de shell, URLs, ficheros persistentes ni comandos que impriman el valor:

```bash
gcloud sql users create proxus_preview_bootstrap \
  --project="$GCP_PROJECT_ID" --instance="$PREVIEW_PLATFORM_INSTANCE_NAME" --type=BUILT_IN
gcloud sql users set-password proxus_preview_bootstrap \
  --project="$GCP_PROJECT_ID" --instance="$PREVIEW_PLATFORM_INSTANCE_NAME" --prompt-for-password
# Desde el password manager/entrada segura que contiene exactamente el mismo valor,
# sin eco ni argumento de proceso:
<password-manager-command> | gcloud secrets versions add preview-database-bootstrap-password \
  --project="$GCP_PROJECT_ID" --data-file=-
```

Verificar metadata y existencia de una versión habilitada sin acceder/imprimir el payload. Configurar `DATABASE_BOOTSTRAP_PASSWORD_SECRET_ID=preview-database-bootstrap-password` como variable no secreta del environment preview. Rotación: añadir primero una versión con el nuevo valor por entrada segura, ejecutar `set-password --prompt-for-password` con ese mismo valor, probar un bootstrap y solo entonces deshabilitar la versión anterior. Si falla entre ambos pasos, conservar ambas versiones y reconciliar manualmente; jamás copiar el valor a Alchemy o logs.

## Provenance de imágenes

Los workflows ejecutan `infra/scripts/build-images.sh` desde el checkout confiable, pero envían a Cloud Build la URL Git canónica y el SHA completo autorizado. Para `gcloud builds submit URL --git-source-revision`, la revisión resuelta aparece en `sourceProvenance.resolvedGitSource.revision`; no se debe exigir `resolvedRepoSource.commitSha`. El gate exige conjuntamente `SUCCESS`, URL/revisión resueltas, las cuatro substitutions exactas (`_SOURCE_SHA`, `_SOURCE_CONTEXT_SHA256`, `_IMAGE_PREFIX`, `_IMAGE_TAG`) y exactamente un digest válido por cada nombre esperado en `results.images`. Solo entrega referencias `@sha256`; ni tags ni `latest` son entradas de deploy. El hash de contexto Git es SHA-256 de `URL-canónica-con-.git + LF + SHA + LF` y queda además como label de imagen.

Un build manual con checkout dirty no puede atestarse como ese commit ni usarse para deploy. Para investigarlo de forma reproducible: crear primero un único `.tar.gz` determinista del contexto efectivo (incluidos los cambios dirty y las reglas de ignore) y ejecutar `build-images.sh` con `SOURCE_CONTEXT_TAR` apuntando a ese fichero y `SOURCE_CONTEXT_GCS_URI` a un objeto nuevo del bucket source. El script calcula SHA-256 sobre esos bytes, sube y envía el mismo fichero sin regenerarlo y toma `infra/cloudbuild/images.yaml` del propio tar, nunca del checkout ambiente. Después exige `resolvedStorageSource`; `gcloud` puede copiar el objeto enviado a otro objeto de staging, por lo que no exige que su nombre coincida con `SOURCE_CONTEXT_GCS_URI`. Falla cerrado salvo que proyecto y bucket sean los autorizados, la source resuelta tenga una `generation` numérica e inmutable y la entrada de `sourceProvenance.fileHashes` identificada exactamente por `gs://bucket/objeto#generation` contenga exactamente el SHA-256 del tar local (además de coincidir `_SOURCE_CONTEXT_SHA256`). Si falta esa evidencia, difiere el hash o solo existe un SHA Git declarado, el contexto dirty no está probado. Este protocolo es evidencia manual, no habilita deployment.

## Production

`deploy-production.yml` autoriza el SHA exacto de `main`. Cloud Build publica cuatro digests; el workflow:

1. valida configuración y gates;
2. hace plan/deploy con servicios desactivados para identidades/job;
3. obtiene outputs, ejecuta y espera migraciones;
4. extrae el artefacto web por digest;
5. vuelve a hacer plan/deploy con servicios activados;
6. obtiene el A record requerido; DNS y smoke tests son operaciones revisadas.

Comandos de inspección son `plan/deploy/outputs --stage production`; preferir el workflow para conservar orden y autenticación. No hay rollback automático de schema o DNS. Si migración falla, no habilitar servicios. Si falla la segunda convergencia, comprobar idempotencia y volver a planificar; no repetir migraciones a ciegas. Production no se ha aplicado.

## Previews y reconciliación

Solo un PR abierto, same-repository, contra `main`, con `deploy-preview` y aprobación vigente del SHA puede desplegarse. Un `synchronize` invalida la aprobación anterior. IaC/credenciales proceden de `main`; solo el source SHA revisado llega al build.

El workflow converge primero jobs, ejecuta `database-bootstrap`, espera, ejecuta migración, espera y después converge los dos servicios IAP. El job de migración recibe `DATABASE_RUNTIME_ROLE` explícitamente y, tras aplicar Drizzle, concede dentro de una transacción DML/sequences existentes y futuros en `public`/`drizzle` a runtime y los revoca de `PUBLIC`; el bootstrap no intenta alterar default privileges de un rol de migración del que no es miembro. Mientras preview no tenga bucket, los backends usan `OBJECT_STORAGE_LOCAL_ROOT=/tmp/proxus-object-storage`. Es almacenamiento local writable, efímero y aislado por instancia: `maxInstances: 1` evita múltiples copias concurrentes, pero reinicios/reemplazos pierden los objetos y los servicios no comparten archivos. No se debe tratar como persistencia ni cambiar production por esta excepción. Closing/unlabel ejecuta destroy. `reconcile-previews.yml` lista stages y destruye huérfanos bajo la misma política/concurrency. Tras un destroy correcto y la liberación del lease, el wrapper elimina el objeto de stage solo si la generación que acaba de descifrar no contiene resources, output ni lease; el CAS impide que una carrera o takeover borre state nuevo. El listado descifra además los objetos y omite documentos vacíos históricos. No borrar objetos manualmente ni interpretar como huérfano un documento no vacío.

Para diagnóstico, reemplazar el placeholder por un PR verificado:

```bash
pnpm --filter @proxus/infra alchemy:infra -- plan --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- outputs --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- destroy --pr <number>
pnpm --filter @proxus/infra alchemy:infra -- list-preview-stages
```

Antes de destroy manual, verificar PR, stage `pr-<number>`, ausencia de writers y cleanup de datos/usuarios. Revisar en los logs que los `ProjectIamMember`, grants IAM de secretos y grants IAM de BigQuery terminan su delete antes de desaparecer del state: cada delete relee la policy, retira exclusivamente el member incondicional gestionado, conserva bindings ajenos/condicionados y reintenta conflictos de etag. Un error IAM conserva el recurso en state y hace fallar destroy; no retirar tombstones del state ni dar el cleanup por completado hasta comprobar las policies vivas. Actualmente no existe ningún stage preview aplicado.

## Recuperación de state/lease

Detener todos los writers. Para bootstrap local fuera de CI, conservar una copia íntegra de `.alchemy/state/bootstrap/` puede servir como evidencia, pero no garantiza recuperación y nunca se edita el documento. En CI ese directorio efímero no se persiste: recuperar mediante inventario y readopción controlada de únicamente los mismos IDs físicos, siguiendo la sección Bootstrap.

Para state remoto, conservar generaciones del objeto GCS y diagnosticar lease, owner, expiry y writer antes de actuar. No borrar el lease, no restaurar una generación con un writer activo y no manipular ciphertext. Una operación expirada debe terminar; una nueva operación adquiere una identidad distinta y fencea la anterior. Escalar cualquier recuperación que requiera restaurar una generación KMS/GCS y registrar el incidente.

Alchemy es el único writer. El export cifrado anterior al cutover es solo evidencia/backup archivado: no se restaura ni se usa para introducir cambios de infraestructura.

## Auditoría

Revisar periódicamente IAM/WIF y cuentas sin keys, versiones/recuperación del bucket, KMS, leases, APIs, digests, privacy de bucket/CDN/IAP, deletion/retention policies, previews huérfanos y datos Cloud SQL. Ejecutar tests, typecheck y un plan real tras upgrades de Alchemy/providers/workflows.
