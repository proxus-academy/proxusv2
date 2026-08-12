# Agent streaming, inspector y trazas externas

## Context

El playground Gemini entrega hoy respuestas completas: `OneTurnModel.generate` bloquea hasta finalizar y la CLI imprime al final. El harness ya dispone de journal durable, proyección segura de inspector, `ArtifactStore`, telemetría OTLP y assets de Grafana, pero no hay endpoints ni UI admin para consultar runs. Se quiere añadir streaming y una UI de inspección, manteniendo en SQL todo el estado funcional/reanudable y desplazando a object storage únicamente los payloads técnicos voluminosos de trazas.

Principio de almacenamiento:

- **SQL:** mensajes/contexto necesarios para reanudar, journal, checkpoints, runs, sesiones, operaciones, approvals, budgets y metadatos/referencias de trazas.
- **Object storage:** para cada invocación, copia técnica redactada de request/response del proveedor, deltas con orden/timestamp relativo y atributos extensos que no participan en reanudación; envelope JSON v1 comprimido con gzip y, inicialmente, sin expiración.
- **OTLP/Tempo:** spans técnicos y métricas; no es fuente de verdad funcional.

Decisiones confirmadas:

- la captura de payload técnico estará siempre habilitada en las composiciones reales;
- los deltas se conservarán en object storage, no en SQL;
- mientras el admin siga explícitamente sin autenticación, se permitirá descargar el payload desde esa superficie temporal; se documentará como no desplegable públicamente y se aislará en un endpoint para retirarlo al introducir identidad;
- `agent run` mostrará texto incremental y emitirá metadata final separada.

## Approach

Corte vertical recomendado:

1. Introducir `stream` en `OneTurnModel` como stream application-owned de eventos discriminados (`TextDelta` y `Completed`), manteniendo `generate` como colector compatible para callers y modelos scripted existentes; ningún tipo de `effect/unstable/ai` escapará del adapter.
2. Consumir el mismo stream desde `RunEngine`, acumulando el resultado final para el commit atómico y ofreciendo un callback/observer scoped para progreso efímero. `agent chat` y `agent run` renderizarán deltas inmediatamente; la metadata final irá separada del stdout textual.
3. Añadir `agent_trace_payloads` como índice SQL enlazado a run y turno, con trace/span/provider/model/status/timing/usage, estado de captura, `artifact_id` nullable, hash SHA-256, bytes, content type, schema/redaction version y expiración nullable. No contendrá prompt, respuesta ni deltas. Un port `AgentTraceStore` separado cubrirá escritura/listado/detalle sin convertir `AgentStore.snapshot` en API de producto.
4. Capturar por cada invocación un envelope JSON v1 comprimido con gzip (`application/json`, `content-encoding: gzip`) con request normalizada, partes de streaming ordenadas con offsets temporales, respuesta final y metadata segura. Redactar antes de serializar, escribir de forma inmutable mediante `ArtifactStore` y registrar la referencia SQL; la API key y headers no formarán parte del envelope. Si el artifact falla, el run continúa y SQL conserva `captureStatus=failed` con una categoría segura. La política inicial confirmada es sin expiración (`expiresAt` opcional/nullable), manteniendo soporte para retención futura.
5. Exponer contratos `AdminApi` tipados: `GET /admin/agent-runs`, `GET /admin/agent-runs/:runId`, `GET /admin/agent-runs/:runId/traces` y `GET /admin/agent-runs/:runId/traces/:traceId/payload`. Listado/detalle usan schemas paginados/acotados; el payload se descarga aparte.
6. Implementar handlers en `backend-admin-transport` y composición PGlite/PostgreSQL en `admin-server`.
7. Añadir `Agent runs` y `Run detail` en `apps/admin` mediante Effect Atom y cliente HTTP tipado.
8. Enlazar, cuando exista configuración, con el backend de trazas (Grafana/Tempo) usando IDs; la UI durable seguirá funcionando sin OTLP.

El inspector no devolverá directamente prompts, mensajes internos, errores crudos ni payloads técnicos. El acceso al payload exacto será una operación separada. Temporalmente usará un principal admin de desarrollo fijo porque el repositorio aún no tiene identidad; la ruta quedará confinada al `admin-server`, marcada como insegura para exposición pública y diseñada para cambiar a autorización real sin alterar el índice ni el storage.

No se reutilizará directamente el `ObjectStorage` privado de `apps/server`, porque introduciría una dependencia entre aplicaciones. `ArtifactStore` seguirá siendo el port neutral del harness; los adapters filesystem/local y futuros S3/GCS implementarán ese port o compartirán una abstracción de infraestructura extraída fuera de `apps/server`.

## Files to modify

Rutas críticas previstas (se concretarán tras inspeccionar contratos y composition roots):

- `packages/agent-harness/src/ai/effect-ai.ts`
- `packages/agent-harness/src/ai/model-turn.ts`
- `packages/agent-harness/src/observability/*`
- `packages/agent-harness/src/store/artifact-store.ts`
- `packages/agent-harness/src/store/trace-store.ts` (nuevo port de índice/consulta)
- `apps/agent-cli/src/playground.ts`
- `apps/agent-cli/src/main.ts`
- `packages/backend-infra/src/database/schema.ts`
- `packages/backend-infra/src/modules/agent-harness/store/shared/layer.ts`
- `packages/backend-infra/src/modules/agent-harness/models/gemini/layer.ts`
- `packages/shared/src/admin-api.ts`
- `packages/shared/src/modules/agent-harness/*` (nuevo contrato administrativo)
- `packages/backend-admin-transport/src/modules/agent-harness/*`
- `apps/admin-server/src/*`
- `apps/admin/src/modules/agent-harness/*`
- `apps/admin/src/app/navigation.ts`
- migración PostgreSQL canónica bajo `packages/backend-infra/drizzle/`
- `docs/api.md`, `docs/testing.md`, `docs/architecture/agent-harness.md`

## Reuse

- Adapter Effect AI existente: `packages/agent-harness/src/ai/effect-ai.ts`.
- Persistencia y journal: `packages/agent-harness/src/run/*` y `packages/backend-infra/src/modules/agent-harness/store/shared/layer.ts`.
- Proyección segura del inspector: `packages/agent-harness/src/observability/index.ts`.
- Port de artefactos: `packages/agent-harness/src/store/artifact-store.ts`.
- Adapter filesystem: `packages/backend-infra/src/modules/agent-harness/artifacts/filesystem.ts`.
- Export OTLP: `packages/backend-infra/src/modules/agent-harness/observability/otlp.ts`.
- Contratos y clientes administrativos: `packages/shared/src/admin-api.ts` y `apps/admin/src/modules/study-catalog/api.ts`.
- Runtime/queries Effect Atom del admin: `apps/admin/src/modules/study-catalog/*`.
- Object storage de producto existente: `apps/server/src/infrastructure/object-storage/*`; se evaluará si adaptar su port o mantener `ArtifactStore` como límite del harness.

## Steps

- [x] Inspeccionar las APIs exactas de streaming de Effect AI, el inspector actual, `ArtifactStore`, esquema SQL y composition roots admin.
- [x] Definir schemas y política de clasificación/redacción del payload técnico, límites máximos por delta/envelope y truncado explícito; configurar expiración nullable.
- [x] Extender el port de modelo con streaming preservando la API no-streaming y tests deterministas.
- [x] Implementar streaming Gemini y salida incremental segura en `agent chat`/`agent run`.
- [x] Añadir modelo SQL y migración para el índice de trazas y referencias de payload, sin blobs ni secretos.
- [x] Implementar persistencia best-effort de payloads técnicos redactados en `ArtifactStore`, con hash, tamaño, content type y schema version.
- [x] Añadir consultas de store para listar runs y construir el inspector desde facts seguros.
- [x] Definir y probar los endpoints tipados de administración.
- [x] Implementar handlers y Layers PGlite/PostgreSQL del admin server.
- [x] Implementar runtime, atoms y vistas `Agent runs`/`Run detail` en `apps/admin`; añadir navegación mínima entre catálogo, listado y detalle sin fetch/useEffect en componentes.
- [x] Añadir enlaces opcionales a Grafana/Tempo por trace ID.
- [x] Actualizar documentación de API, arquitectura, seguridad, retención y operación.

## Verification

- Tests unitarios del adapter de streaming: orden de deltas, finalización, interrupción, error y ausencia de duplicación.
- CLI real opt-in con Gemini: primer delta visible antes de completar, metadata final separada, cancelación que interrumpe upstream y contexto correcto en turnos posteriores.
- Contrato memory/PGlite/PostgreSQL para metadata de trazas y referencias de artifacts.
- Tests de redacción que impidan API keys, headers de autorización y secretos en SQL, archivos, logs y UI; verificar límites/truncado y que gzip descomprime a un envelope v1 válido.
- Tests HTTP con cliente tipado: listado, detalle, not-found, errores seguros y autorización fail-closed del payload.
- Tests Effect Atom: loading/error/empty/success, aislamiento por run ID y refresh.
- Smoke admin: abrir listado, navegar a detalle, ver timeline/hijos/budgets y resolver el payload solo con permiso.
- Gates: `pnpm effect:diagnostics`, `pnpm effect:lint`, typecheck, tests, build y `db:check`.
