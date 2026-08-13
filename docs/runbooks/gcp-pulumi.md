# Runbook: bootstrap y foundation Pulumi/GCP

## Prerrequisitos

- `gcloud` autenticado con un operador autorizado en `proxus-v2`;
- Node `22.22.2`, Corepack `0.35.0`, pnpm `10.32.1`;
- dependencias instaladas con `pnpm install --frozen-lockfile`;
- Pulumi CLI `3.257.0`, igual que `.pulumi.version` y `@pulumi/pulumi`;
- nunca usar una clave JSON: local usa credenciales de usuario o impersonación y CI usa WIF.

Comprobar el contexto sin imprimir tokens:

```bash
gcloud auth list --filter=status:ACTIVE
gcloud config get-value project
git status --short
```

## Bootstrap de state

El script es idempotente y no elimina recursos. Crea, solo si faltan, y converge sus protecciones:

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

No añadir retention lock al bucket. No conceder acceso público. El bootstrap no debe crear service-account keys ni guardar credenciales.

## Foundation

Inicializar o seleccionar y revisar:

```bash
export PULUMI_BACKEND_URL=gs://proxus-v2-pulumi-state
export PULUMI_SECRETS_PROVIDER='gcpkms://projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state/cryptoKeys/pulumi-secrets'

pnpm infra preview --environment foundation
pnpm infra deploy --environment foundation
pnpm infra outputs --environment foundation
```

El wrapper inicializa el stack con KMS si falta. Todos los recursos foundation declarados están protegidos. No ejecutar `pulumi destroy`, no retirar `protect` y no deshabilitar APIs.

Validación posterior:

```bash
gcloud artifacts repositories describe proxus \
  --project proxus-v2 --location europe-southwest1
gcloud iam workload-identity-pools list \
  --project proxus-v2 --location global
gcloud iam service-accounts list \
  --project proxus-v2 --filter='email:proxus-'
```

Revisar además que las cuatro service accounts foundation no tengan claves administradas por usuario y que los providers WIF mantengan las conditions exactas del programa.

## Outputs para GitHub

Obtener outputs no secretos:

```bash
pulumi --cwd infra/foundation stack output --stack foundation --json > /tmp/proxus-foundation-outputs.json
```

Los nombres de provider y service account son variables de repositorio, no secretos. No guardar el JSON temporal en el repositorio y eliminarlo al terminar:

```bash
rm -f /tmp/proxus-foundation-outputs.json
```

Los environments `production` y `preview` deben existir antes de usar las identidades. Sus workflows deberán ejecutarse desde `main`; cambiar nombres, rutas, refs o environments exige actualizar foundation y revisar el preview.

## Recuperación de state

Primero detener writers y comprobar locks/concurrencia. Exportar antes de intervenir:

```bash
pulumi login gs://proxus-v2-pulumi-state
pulumi --cwd infra/foundation stack export --stack foundation > /tmp/foundation-state-backup.json
```

Listar generaciones del checkpoint afectado:

```bash
gcloud storage ls --all-versions \
  gs://proxus-v2-pulumi-state/.pulumi/stacks/proxus-foundation/
```

Preferir `pulumi stack history` y `pulumi stack export/import` revisado. Nunca borrar locks a ciegas ni restaurar una generación mientras exista un writer. Tras recuperar, ejecutar `pulumi refresh` y `pulumi preview --diff`, eliminar los backups temporales y registrar el incidente.

## Auditoría periódica

- revisar miembros WIF/IAM y service accounts sin keys;
- revisar versiones antiguas del bucket y la capacidad de recuperar state;
- comprobar rotación KMS y decrypt de los stacks;
- revisar APIs, Artifact Registry y permisos efectivos;
- ejecutar tests, typecheck y preview Pulumi después de upgrades de provider o CLI.
