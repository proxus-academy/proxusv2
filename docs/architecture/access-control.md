# Control de acceso

## Estado y objetivo

Las rutas de escritura de `study-catalog` se mantienen temporal y explícitamente accesibles sin autenticación ni autorización durante esta fase de desarrollo. Esta decisión permite avanzar el panel administrativo y no debe bloquearse por la elección futura de autenticación. El documento define la integración posterior de `effect-access` sin confundir permisos de interfaz con seguridad del servidor.

`effect-access` se ha revisado desde el repositorio local hermano `../effect-access` (versión `0.1.0`, commit `134768b`). Es un motor RBAC con scopes para Effect; no proporciona autenticación, sesiones, middleware HTTP, persistencia, auditoría ni integración React.

## Decisión propuesta

La autoridad siempre reside en el servidor:

```text
apps/admin
  clientes tipados PublicApi + AdminApi y atoms de sesión/capacidades
                    ↓
packages/shared
  contratos HTTP, errores 401/403 y DTOs de capacidades
                    ↓
apps/admin-server → backend-admin-transport
  autenticación + identidad verificada + traducción de errores
                    ↓
servicio del bounded context
  políticas effect-access
                    ↓
RoleStore port → adapter Drizzle → role_assignments
```

La comprobación de permisos pertenece al servicio de aplicación, no únicamente al handler. Así también quedan protegidos futuros consumidores como jobs o CLI.

## Incorporación de la dependencia

`effect-access` no está publicado en npm y aún no tiene releases. No debe dependerse de una rama Git flotante ni copiarse dentro de `packages/shared`.

Antes de incorporarlo:

1. Probarlo y fijar su peer dependency contra la versión de Effect usada por Proxus.
2. Añadir licencia, metadata, CI con Node/pnpm y una release reproducible.
3. Publicarlo en un registry o consumir una dependencia Git fijada a un commit exacto.
4. Mantener una única instancia canónica de `defineAccess`; cada instancia crea Tags incompatibles.

Mientras siga en `0.1.0`, la opción preferida es una versión publicada interna. Como alternativa temporal:

```json
{
  "effect-access": "github:JavierDeDiegoGuzman/effect-access#134768b"
}
```

No se añade todavía al workspace porque no existe una identidad autenticada ni un contrato estable de distribución.

## Modelo inicial para study catalog

Permisos por caso de uso, evitando un permiso genérico `admin`:

- `studyCatalog:createNode`
- `studyCatalog:connect`
- `studyNode:rename`
- `studyNode:archive`
- `studyEdge:disconnect`

Recursos y scopes iniciales:

- `studyCatalog:global`, para operaciones de creación y conexión;
- `studyNode:<id>`, relacionado con `studyCatalog:global`;
- `studyEdge:<id>`, relacionado con `studyCatalog:global`.

Si aparece multi-tenancy, `global` deberá sustituirse por un scope de organización o catálogo obtenido de datos confiables del servidor.

Para autorizar un recurso existente el orden es:

```text
cargar recurso desde repository → construir recurso autorizable → comprobar política → mutar
```

Los scopes nunca se construirán usando relaciones aportadas libremente por el cliente.

## Persistencia

El adapter de `RoleStore` leerá una tabla semejante a:

```text
role_assignments
- subject_type
- subject_id
- scope_type
- scope_id
- role
- created_at
- granted_by
```

Debe existir una restricción única sobre `(subject_type, subject_id, role, scope_type, scope_id)` y un índice de lectura sobre `(subject_type, subject_id, scope_type, scope_id)`.

Los casos de uso de asignar y revocar roles pertenecen a un futuro bounded context `access-control`. Ese servicio impondrá combinaciones role/scope válidas y auditoría; los schemas de `effect-access` no garantizan esas invariantes.

## HTTP y errores

La autenticación debe producir un subject desde una identidad verificada por request. Nunca se aceptará un `userId` del payload ni un header sin verificar.

Traducción en el borde HTTP:

- ausencia de identidad: `401 Unauthorized`;
- `effect-access.Forbidden`: `403 Forbidden` público y genérico;
- `RoleStoreError`: `500`, con log interno;
- errores funcionales del catálogo: conservan sus códigos actuales.

No se serializa directamente `Forbidden`, ya que puede revelar sujeto, recurso, permiso y razones internas.

Durante la fase actual las rutas administrativas permanecen accesibles sin protección por decisión explícita del proyecto. Se sirven exclusivamente desde `apps/admin-server` (puerto local `3001`) y no deben exponerse públicamente. Esta separación de proceso no equivale a autenticación; la excepción deberá resolverse antes de un despliegue público.

## Frontend

`apps/admin` y `apps/web` no ejecutan `RoleStore` ni deciden seguridad. Consumen capacidades calculadas por el servidor:

- capacidades globales mediante una respuesta de sesión o `/me/capabilities`;
- capacidades por recurso incluidas en el DTO cuando sea necesario.

Effect Atom modelará sesión y capacidades. La UI consulta permisos, no nombres de rol, para mostrar o deshabilitar acciones. El backend vuelve a autorizar cada mutación aunque el control esté oculto.

## Fases

1. Estabilizar y versionar `effect-access`.
2. Continuar el admin contra las rutas actuales sin protección, dejando explícito su carácter temporal.
3. Elegir autenticación y añadir definición canónica, `RoleStore` port/adapters y migración cuando el producto lo priorice.
4. Autorizar los casos de uso del servicio y declarar `401/403` en contratos y tests.
5. Añadir sesión/capacidades tipadas y sus atoms en los frontends.
6. Crear administración de asignaciones con auditoría y protección frente a eliminar al último administrador.

## Pruebas mínimas

- anónimo en `/admin/*` devuelve `401`;
- autenticado sin permiso devuelve `403` sin tocar la mutación del repository;
- rol en scope correcto permite y en otro scope deniega;
- fallo de `RoleStore` devuelve `500`, nunca `403`;
- las rutas públicas siguen siendo públicas;
- revocar un rol impide la siguiente mutación;
- la UI no concede capacidades cuando falla su carga.
