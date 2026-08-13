# Runbook: GCP y Pulumi

Este runbook separa el estado ya provisionado de los procedimientos preparados pero todavía no ejecutados. No autoriza un despliegue por sí mismo: cada `up`, job de migración, DNS y smoke test requiere aprobación operativa explícita.

## Prerrequisitos comunes

- `gcloud` autenticado con un operador autorizado en el proyecto configurado;
- Node `22.22.2`, Corepack `0.35.0`, pnpm `10.32.1`;
- dependencias instaladas con `pnpm install --frozen-lockfile`;
- Pulumi CLI `3.257.0`, igual que `.pulumi.version` y `@pulumi/pulumi`;
- `jq` para verificar los resultados de Cloud Build;
- nunca usar una clave JSON: local usa credenciales de usuario o impersonación y CI usa WIF.

Comprobar el contexto sin imprimir tokens:

```bash
gcloud auth list --filter=status:ACTIVE
gcloud config get-value project
git status --short
```

La región normativa es `europe-southwest1`. Los comandos siguientes muestran los identificadores versionados actuales; si cambia el proyecto, hay que modificar y revisar IaC, configs y workflows, no hacer una sustitución parcial en la terminal.

## Estado operativo registrado

Solo se ha ejecutado foundation. El bootstrap creó/convergió el backend GCS/KMS y el stack foundation fue aplicado; un preview posterior informó **48 recursos unchanged**. Production y previews no se han desplegado. En particular, no se han creado mediante esta IaC servicios Cloud Run de aplicación, jobs de migración, imágenes de aplicación, bucket/CDN web, DNS ni stacks `pr-<number>`.

Antes de cualquier operación, confirmar que este registro sigue vigente con `pulumi stack history`, `pulumi stack ls` y un preview, sin interpretar una configuración o un test mock como evidencia cloud.

## Bootstrap de state

`infra/scripts/bootstrap-state.sh` es idempotente y no elimina recursos. Crea, solo si faltan, y converge:

- `gs://proxus-v2-pulumi-state` en `europe-southwest1`;
- versionado, uniform bucket-level access y public access prevention;
- keyring `pulumi-state` y key `pulumi-secrets` con rotación cada 90 días.

```bash
GCP_PROJECT_ID=proxus-v2 infra/scripts/bootstrap-state.sh
```

Verificar:

```bash
gcloud storage buckets describe gs://proxus-v2-pulumi-state \
  --project proxus-v2 \
  --format='yaml(name,location,versioning,iamConfiguration)'
gcloud kms keys describe pulumi-secrets \
  --project proxus-v2 \
  --location europe-southwest1 \
  --keyring pulumi-state
```

No añadir retention lock, acceso público, service-account keys ni credenciales guardadas. El bucket y la clave están fuera del stack porque son requisitos para leer su state.

## Foundation

Exportar el backend y provider de secretos exactos:

```bash
export PULUMI_BACKEND_URL=gs://proxus-v2-pulumi-state
export PULUMI_SECRETS_PROVIDER='gcpkms://projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state/cryptoKeys/pulumi-secrets'
```

Validar y revisar sin aplicar:

```bash
pnpm --filter @proxus/infra typecheck
pnpm --filter @proxus/infra test
bash -n infra/scripts/bootstrap-state.sh
pnpm infra preview --environment foundation
```

El wrapper selecciona o inicializa `foundation` con KMS. Solo tras una aprobación explícita de un preview esperado:

```bash
pnpm infra deploy --environment foundation
pnpm infra outputs --environment foundation
```

No ejecutar `destroy`, no retirar `protect` y no deshabilitar APIs. Un estado estable debe mostrar 48 recursos sin cambios mientras el programa foundation no cambie; si el recuento o diff difiere, detenerse y revisarlo en lugar de normalizarlo como drift aceptable.

Validación posterior:

```bash
gcloud artifacts repositories describe proxus \
  --project proxus-v2 --location europe-southwest1
gcloud iam workload-identity-pools list \
  --project proxus-v2 --location global
gcloud iam service-accounts list \
  --project proxus-v2 --filter='email:proxus-'
```

Comprobar también que las cuatro service accounts foundation no tengan claves administradas por usuario y que las conditions WIF coincidan con los workflows versionados.

## Configuración manual de GitHub

Crear los environments protegidos `production` y `preview`. Cargar como variables de repositorio/environment los outputs no secretos de foundation:

```bash
pulumi --cwd infra/foundation stack output --stack foundation --json \
  > /tmp/proxus-foundation-outputs.json
```

Mapear los outputs a `GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER`, `GCP_PREVIEW_WORKLOAD_IDENTITY_PROVIDER`, `GCP_BUILD_SUBMITTER_SERVICE_ACCOUNT`, `GCP_PRODUCTION_DEPLOYER_SERVICE_ACCOUNT` y `GCP_PREVIEW_DEPLOYER_SERVICE_ACCOUNT`, además de `GCP_PROJECT_ID`. No guardar el JSON en el repositorio:

```bash
rm -f /tmp/proxus-foundation-outputs.json
```

Los workflows WIF solo son válidos desde sus rutas exactas en `refs/heads/main`. Cambiar nombre, ruta, branch o environment requiere actualizar foundation y revisar un preview.

## Gates manuales antes del primer runtime

Production y preview deben permanecer con `APPLICATION_RUNTIME_READY` ausente o distinto de `true` hasta completar y comprobar, como mínimo:

1. adapters reales de email y Google; producción falla cerrada mientras no existan;
2. cuatro imágenes construibles desde el SHA autorizado y publicadas por digest con provenance coincidente;
3. bases Neon y usuarios preparados fuera de Pulumi, con los `DATABASE_URL` guardados en versiones de Secret Manager;
4. secretos de firma, dataset/tabla analytics y permisos efectivos;
5. un grupo real autorizado para `IAP_GROUP_PRINCIPAL` en formato `group:<dirección>`;
6. para production, dominio y nombre globalmente único del bucket web, más ownership y cambio DNS preparados;
7. revisión explícita del riesgo actual de compartir una credencial de base entre APIs y migraciones;
8. plan y operador para ejecutar migraciones, comprobar readiness y detenerse ante fallo;
9. smoke tests autenticados de IAP, API pública/admin, assets CDN y ausencia de acceso directo no autorizado;
10. para previews, procedimiento externo de alta/baja de base Neon y secreto por PR.

No introducir valores de ejemplo como si fueran reales y no guardar valores secretos en config Pulumi. Las variables `NEON_PRODUCTION_DATABASE_SECRET_ID` y `NEON_PREVIEW_DATABASE_SECRET_ID_TEMPLATE` contienen **IDs de Secret Manager**, no URLs; la plantilla preview debe incluir `{pr}`.

## Production: procedimiento preparado, aún no ejecutado

El workflow `.github/workflows/deploy-production.yml` solo autoriza el SHA exacto de `main` que contiene el workflow. Cloud Build construye/publica; el job deploy ejecuta Pulumi.

Secuencia implementada:

1. construir `proxus-server`, `proxus-admin-server`, `proxus-web` y `proxus-admin-web`;
2. verificar provenance y obtener cuatro URIs `@sha256`;
3. configurar el stack DIY `organization/proxus-production/production`;
4. aplicar con `deployServices=false` para crear identidades y job;
5. ejecutar y esperar el Cloud Run Job de migración;
6. extraer el artefacto web de su imagen por digest;
7. aplicar con `deployServices=true` para API pública, Admin/IAP y web privada/CDN;
8. leer `requiredDnsARecord` y efectuar manualmente el cambio DNS revisado;
9. esperar certificado y ejecutar los smoke tests definidos en los gates.

No ejecutar manualmente esta secuencia hasta cerrar todos los gates. No hay rollback automático de schema ni de DNS. Si una migración falla, no habilitar servicios; conservar logs y state para diagnóstico. Si falla el segundo apply, no volver a ejecutar migraciones a ciegas: confirmar su estado idempotente y hacer preview antes de reanudar.

Production usa:

- web pública: HTTPS load balancer + bucket GCS privado + Cloud CDN, con `/api` hacia la API pública y reescritura del prefijo antes del router backend;
- Admin: IAP directo de Cloud Run para el principal de grupo configurado;
- backends productivos Node/PostgreSQL, nunca `apps/dev-server` ni PGlite.

## Previews: lifecycle preparado, aún no ejecutado

Añadir `deploy-preview` solo a un PR del mismo repositorio contra `main`, con aprobación vigente del SHA actual por owner/member/collaborator. Un `synchronize` invalida la aprobación del SHA anterior hasta que el nuevo commit sea aprobado.

La IaC y los scripts con credenciales siempre proceden del SHA confiable de `main`; Cloud Build recibe únicamente el SHA del PR aprobado. Como los environments pueden dejar un job esperando aprobación manual, build y deploy vuelven a comprobar PR, label, SHA y aprobación inmediatamente antes de autenticarse. El destroy rechaza igualmente un evento obsoleto si el PR ya volvió a estar abierto y etiquetado. El stack es `organization/proxus-preview/pr-<number>` y el número debe coincidir con `prNumber`.

La secuencia converge primero el job, ejecuta la migración y después crea dos Cloud Run protegidos por IAP con máximo una instancia. Retirar la label o cerrar el PR destruye el stack. El reconciliador diario destruye stacks `pr-<number>` sin un PR abierto, same-repository, contra `main` y con label. No elimina la base Neon ni el secreto externo: esa limpieza sigue siendo manual/pendiente y debe acompañar cada destrucción para evitar datos huérfanos.

Si el evento de cierre/unlabel falla, ejecutar `Reconcile previews` desde `main`. Antes de un destroy manual, verificar número, PR, stack y ausencia de writers:

```bash
pulumi login gs://proxus-v2-pulumi-state
pulumi --cwd infra/preview stack select pr-<number>
pnpm infra preview --pr <number>
pnpm infra destroy --pr <number>
```

`<number>` es un placeholder y debe sustituirse por un PR real verificado. El wrapper no permite destruir foundation o production.

## Recuperación de state

Detener writers y comprobar locks/concurrency. Exportar antes de intervenir; elegir el directorio y stack afectados:

```bash
pulumi login gs://proxus-v2-pulumi-state
pulumi --cwd infra/foundation stack export --stack foundation \
  > /tmp/foundation-state-backup.json
gcloud storage ls --all-versions \
  gs://proxus-v2-pulumi-state/.pulumi/stacks/proxus-foundation/
```

Preferir `pulumi stack history` y `pulumi stack export/import` revisado. Nunca borrar locks a ciegas ni restaurar una generación mientras exista un writer. Después, ejecutar `pulumi refresh` y `pulumi preview --diff`, eliminar backups temporales y registrar el incidente.

## Auditoría periódica

- revisar miembros WIF/IAM, conditions exactas y service accounts sin keys;
- revisar versiones antiguas del bucket y ensayar recuperación controlada de state;
- comprobar rotación KMS y decrypt de los tres tipos de stack;
- revisar APIs, Artifact Registry, permisos efectivos y digests desplegados;
- reconciliar stacks preview con PRs y limpieza externa Neon/Secret Manager;
- comprobar deletion protection y privacidad de bucket/CDN/IAP;
- ejecutar tests, typecheck y preview después de upgrades de provider, CLI, imágenes base o workflows.
