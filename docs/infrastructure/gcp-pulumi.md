# Infraestructura GCP y Pulumi

> **Estado:** normativa de infraestructura
> **Última revisión:** 2026-08-13

## Límite de foundation

La infraestructura compartida de Proxus se declara en TypeScript bajo `infra/foundation` como proyecto Pulumi `proxus-foundation`, stack `foundation`. El proyecto GCP es `proxus-v2` y la región normativa es `europe-southwest1`.

Foundation posee exclusivamente:

- APIs GCP requeridas por los despliegues;
- un Artifact Registry Docker regional con tags inmutables;
- service accounts separadas para Cloud Build, submit de builds y deploy de production/preview;
- dos pools/proveedores WIF para las clases production y preview;
- IAM compartido y acceso de los deployers al backend GCS y a su clave KMS.

El bucket de state y la clave KMS no pueden pertenecer al stack que depende de ellos. El único bootstrap imperativo permitido los crea o converge de forma idempotente mediante `infra/scripts/bootstrap-state.sh`. Su procedimiento está en [`../runbooks/gcp-pulumi.md`](../runbooks/gcp-pulumi.md).

## Reglas de seguridad

- No se crean ni almacenan claves JSON de service account.
- No se permiten `allUsers` ni `allAuthenticatedUsers`.
- CI usa WIF restringido por repositorio, GitHub environment y `workflow_ref` exacto sobre `refs/heads/main`.
- Production y preview usan pools WIF y deployers separados.
- Cloud Build tiene una identidad propia sin acceso a secretos runtime, Pulumi state, Cloud Run ni impersonación runtime.
- Los recursos IAM son member no autoritativos para no borrar bindings ajenos.
- Los deployers reciben solo los roles necesarios para su clase de stack. Los roles amplios inevitables no se asignan al executor de builds.
- Todos los recursos declarados por foundation usan protección Pulumi; las APIs tienen `disableOnDestroy: false` y `disableDependentServices: false`.
- Artifact Registry recibe imágenes inmutables; los despliegues posteriores deben consumirlas por digest.

## State y cifrado

El backend es `gs://proxus-v2-pulumi-state`. El bucket usa versionado, uniform bucket-level access y public access prevention. No lleva retention lock porque Pulumi necesita administrar sus locks; el versionado conserva generaciones para recuperación.

Los secretos del state se cifran con:

```text
gcpkms://projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state/cryptoKeys/pulumi-secrets
```

La clave rota cada 90 días. Los deployers tienen administración de objetos y lectura/listado del bucket, más `cryptoKeyEncrypterDecrypter` únicamente sobre esa clave.

## Identidades compartidas

- `proxus-cloud-build`: publica en el registro y escribe logs.
- `proxus-build-submitter`: crea builds y puede usar exclusivamente el executor de Cloud Build.
- `proxus-production-deployer`: opera la futura clase production y lee imágenes.
- `proxus-preview-deployer`: opera la futura clase preview.

Los bindings WIF permiten impersonar el build submitter y el deployer correspondiente solo si el token de GitHub cumple simultáneamente repositorio, environment y workflow/ref esperados.

## Validación y cambios

Antes de aplicar foundation:

```bash
pnpm --filter @proxus/infra typecheck
pnpm --filter @proxus/infra test
bash -n infra/scripts/bootstrap-state.sh
pnpm infra preview --environment foundation
```

Revisar siempre el diff Pulumi. No usar `--target`, `--refresh=false`, `--skip-preview`, edición manual de state ni `pulumi cancel` salvo recuperación documentada. No ejecutar `destroy` sobre foundation ni retirar `protect` para limpiar.

Cambios a state, IAM, WIF, APIs, región, pines o confianza CI deben actualizar este documento y el runbook en el mismo commit.
