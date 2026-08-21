# Plan de integración de chat y observabilidad

> Estado: propuesta de implementación
> Alcance: backend público, persistencia, observabilidad operativa y Admin
> Referencias evaluadas: Proxus original, `effect-ai-chat-example` y `effect-atom-chat`

## Resultado objetivo

Proxus tendrá conversaciones persistentes propiedad de una cuenta, mensajes
ordenados, un Agent Run activo como máximo por conversación, streaming
interrumpible y recuperación autoritativa tras desconexión. Cada generación
producirá telemetría operacional mediante OpenTelemetry y un registro de uso AI
consultable desde Admin sin convertir los spans OTLP en fuente de producto.

El primer incremento cubre texto. El modelo deja preparados los identificadores
y relaciones requeridos por attachments, pero el upload y la traducción
multimodal se implementan en un incremento posterior.

## Decisiones tomadas de las referencias

### Proxus original

Se conserva:

- una vista Admin de historial, detalle, estados, latencia, tokens y coste;
- correlación entre conversación, usuario y generación;
- configuración explícita para habilitar exportación OTLP;
- atributos de entorno, versión y nombre del ejecutable;
- separación de permisos administrativos y acceso de producto.

No se copia:

- `Tracer` accediendo directamente a Drizzle;
- almacenar prompts, respuestas y errores completos dentro de spans;
- tipos de objeto abiertos como `related_object_type`;
- búsquedas y agregaciones administrativas construidas directamente en handlers;
- cancelación administrativa que solo cambia el estado persistido sin garantizar
  la interrupción real del trabajo;
- inferir el proveedor a partir del nombre textual del modelo.

### `effect-ai-chat-example`

Se conserva:

- `activeRunId` como compare-and-set para impedir generaciones concurrentes;
- `runId` distinto de `threadId`;
- preparación, ejecución y finalización explícitas;
- streams por run, cancelación estructurada y tests de carreras;
- Layer de tracing situada en el composition root.

Se adapta:

- los mensajes pasan de una columna JSON a filas normalizadas;
- el coordinador in-memory no será la autoridad de recuperación;
- RPC/WebSocket se sustituye por contratos HTTP tipados y SSE;
- los handlers no acceden al repository ni al modelo AI directamente.

### `effect-atom-chat`

Se conserva para la fase frontend posterior:

- streaming como valor de primera clase;
- interrupción de la fiber y cierre del stream;
- estado derivado y conservación del resultado parcial;
- `Atom.family` por identidad de conversación/run.

No se usa como modelo backend porque el cliente envía el historial completo y
la conversación es efímera.

## Límites y dirección de dependencias

```text
Public HTTP/SSE -> Conversation use cases -> ConversationRepository -> Drizzle
                                      |----> AiGeneration ---------> Effect AI
                                      |----> AiRunLedger ----------> Drizzle

Admin HTTP -> AiOperations queries -> AiRunLedger -----------------> Drizzle

composition roots -> OpenTelemetry Layer -> OTLP collector
```

`Conversations` es el bounded context de producto. Posee threads, mensajes y
Agent Runs. Un Agent Run contiene Agent Turns; cada turn puede producir Model
Generations y Tool Executions. `AI Operations` es una superficie administrativa
de lectura y operación sobre ejecuciones AI; no posee el contenido de la
conversación. OpenTelemetry es infraestructura transversal y no un bounded
context ni una base de datos de producto.

El seam `AiGeneration` expresa eventos necesarios por Conversations, no los
tipos de Effect AI o de un proveedor. El primer adapter será Effect AI. Un
adapter para `pi-ai` solo se añadirá cuando exista una capability requerida que
Effect AI no proporcione; no se añade una abstracción pass-through preventiva.

## Modelo persistente inicial

### `conversation_threads`

- `id` UUID, clave primaria.
- `owner_id` UUID, FK a `users`, obligatorio.
- `title` texto limitado.
- `next_message_sequence` bigint positivo para asignación atómica del orden.
- `created_at`, `updated_at`, `deleted_at` nullable.
- índice `(owner_id, updated_at desc, id desc)` para listado estable.

### `conversation_messages`

- `id` UUID, clave primaria.
- `thread_id` UUID, FK con borrado en cascada.
- `run_id` UUID nullable; presente para mensajes producidos dentro de un run.
- `role`: `user | assistant | tool`.
- `sequence` bigint positivo y creciente dentro del thread.
- `status`: `committed | streaming | completed | interrupted | failed`.
- `text` nullable; los bloques estructurados podrán añadirse sin cambiar la
  identidad del mensaje.
- `created_at`, `completed_at` nullable.
- unique `(thread_id, sequence)` e índices por `(thread_id, created_at)` y
  `run_id`.

### `conversation_agent_runs`

- `id` UUID, clave primaria y correlation id funcional.
- `thread_id` como FK; los mensajes referencian opcionalmente al run y no se
  introduce el ciclo redundante run -> message -> run.
- `status`: `queued | running | completed | interrupted | failed`.
- `started_at`, `finished_at`, `error_code` sanitizado, `interrupted_by` nullable.
- `lease_owner`, `lease_expires_at`, agent/config version y stop reason.
- `trace_id`/`span_id` opcionales para enlazar con el backend de observabilidad.
- índices por fecha/estado y thread.
- índice único parcial por `thread_id` para estados `queued | running`; la
  inserción del run actúa como compare-and-set y garantiza uno activo.

### `agent_turns`

- `id`, `run_id` y `ordinal` único dentro del run.
- `status`, `started_at`, `finished_at` y decisión final.
- un retry crea otra Model Generation dentro del mismo turn.

### `model_generations`

- `id`, `run_id`, `turn_id` y `attempt`.
- `provider`, `model` y variante explícitos; no inferidos.
- provider request ID, usage source, relación de retry/fallback y configuración
  efectiva de generación.
- `status`, `started_at`, `first_token_at`, `finished_at`.
- `input_tokens`, `output_tokens`, `cached_input_tokens` nullable.
- `cost_micros_usd` bigint nullable; nunca `double precision`.
- `finish_reason`, `error_code` sanitizado y referencias opcionales a los
  Observation Payloads de input y output.
- índices por fecha/status, provider/model, run y turn.

### `tool_executions`

- `id`, `run_id`, `turn_id`, `tool_call_id` e identidad cerrada de herramienta.
- `status`, `started_at`, `finished_at` y `error_code` sanitizado.
- referencias opcionales a Observation Payloads de argumentos y resultado.
- unique `(run_id, tool_call_id)` para idempotencia.

Un chat no agéntico usa un Agent Run, un Agent Turn y una Model Generation. Un
agente puede encadenar `turn 1 -> tools -> turn 2 -> ...` sin migrar el
significado de las tablas existentes.

No se guardan en estas tablas prompts construidos, respuestas duplicadas, stack
traces ni cuerpos completos de error. El contenido autoritativo visible vive en
`conversation_messages`; PostgreSQL conserva metadata operacional y referencias
a Observation Payloads.

## Invariantes de Conversations

1. Todo acceso público comprueba ownership usando la identidad verificada por el
   transporte, nunca un `userId` recibido del cliente.
2. Un thread admite como máximo un run activo.
3. Iniciar un run persiste atómicamente el mensaje del usuario, el placeholder
   del asistente y el run activo.
4. Un run solo puede finalizar mensajes que le pertenezcan y si sigue activo.
5. Cancelar es idempotente y debe interrumpir la fiber viva cuando existe; la
   transición persistida permite recuperar el estado si el proceso ya murió.
6. Los deltas SSE son señales transitorias. Un GET del thread devuelve siempre
   el estado autoritativo persistido.
7. No se mantiene una transacción SQL abierta durante la llamada al modelo.
8. La respuesta parcial se persiste con throttling o checkpoints, y siempre al
   finalizar, interrumpir o fallar.
9. Borrar un thread es inicialmente soft-delete; Admin no puede reutilizar ese
   endpoint para saltarse retención o privacidad.
10. El orden se asigna incrementando `next_message_sequence` bajo lock/update
    atómico; timestamps nunca determinan la secuencia.
11. Runs, turns, generations, tools y payloads tienen state machines cerradas y
    cada transición usa compare-and-set desde estados permitidos.
12. El runtime renueva el lease del run; otro proceso solo reconcilia un run
    cuando su lease ha expirado.

## Protocolo agéntico interno

El seam de generación emite eventos normalizados independientes del proveedor:

- text/reasoning start, delta y end;
- tool call start, argumentos parciales y tool call completo;
- usage y cache usage;
- finish reason y error seguro.

Un Agent Turn termina al responder definitivamente o al producir tool calls. Los
resultados de esas tools alimentan el siguiente turn; un retry o fallback de la
misma decisión sigue siendo otra Model Generation dentro del mismo turn. El
registry de tools es cerrado y tipado y cada tool declara autorización,
idempotencia, timeout y política de retry. Tool output no se convierte
automáticamente en un mensaje visible.

Cada Agent Run fija al comenzar `maxTurns`, `maxToolCalls`, deadline, presupuesto
de tokens/coste y versión de configuración. Alcanzar un límite produce un stop
reason explícito y nunca un loop ilimitado.

## Observabilidad

### OpenTelemetry operacional

Cada composition root proporciona al final del grafo una Layer configurable:

- `OTEL_ENABLED`, desactivado por defecto en tests;
- `OTEL_EXPORTER_OTLP_ENDPOINT`;
- `OTEL_SERVICE_NAME` distinto para `server`, `admin-server` y `dev-server`;
- `SERVICE_VERSION` y `DEPLOY_ENV` como resource attributes;
- shutdown y flush gestionados por el Scope del runtime.

Spans estables iniciales:

- `conversation.create`
- `conversation.list`
- `conversation.get`
- `conversation.agent-run.start`
- `conversation.agent-turn`
- `ai.generate`
- `ai.tool.execute`
- `conversation.agent-run.checkpoint`
- `conversation.agent-run.interrupt`
- `admin.ai-runs.list`
- `admin.ai-runs.get`

Atributos permitidos: status, provider, model, finish reason, token counts,
attachment count y tamaños agrupados. No se exportan prompt, respuesta, título,
filename, MIME aportado por usuario, signed URL, email o stack del proveedor.
Los IDs de thread/run se añaden como atributos de span solo tras documentar
retención y acceso del collector; el `trace_id` almacenado en el run basta para
correlación desde Admin.

### Ledger persistente

Agent Runs, Agent Turns, Model Generations y Tool Executions alimentan Admin,
costes y soporte. No se consulta el backend OTLP para construir funcionalidad de
producto. La escritura del resultado del run forma parte de la finalización del
caso de uso; un fallo del exportador OTLP no cambia la generación.

Coste se calcula mediante una política versionada por `(provider, model,
effective_from)`. Si no hay tarifa conocida, queda `null`; nunca se inventa un
coste ni se deduce el proveedor desde el nombre.

### Observation Payloads en object storage

Los inputs/outputs técnicos completos pueden guardarse como blobs JSON
versionados y comprimidos en object storage. PostgreSQL guarda únicamente:

- object key opaca generada por el servidor;
- tipo `generation-input | generation-output | tool-input | tool-output`;
- schema version, tamaño, hash SHA-256 y estado `pending | available | failed`;
- versión de redacción y timestamps de creación/expiración.

Esto no sustituye `conversation_messages`: los mensajes que necesita el producto
siguen en PostgreSQL. El blob representa el envelope técnico enviado o recibido
del proveedor, posiblemente con system prompt, tools y partes multimodales, y
por tanto tiene permisos y retención más restrictivos.

El `ObjectStorage` existente ya ofrece `put/get/remove` y transferencias firmadas,
pero hoy vive en `apps/server` y solo tiene adapter local. Para usarlo desde
backend y Admin se moverá su seam a un package backend compartido y se añadirá
un adapter S3 real; la implementación local se conserva para desarrollo. Con
dos adapters el seam deja de ser hipotético.

La persistencia del chat no debe fallar porque falle la captura diagnóstica. El
flujo crea metadata `pending`, escribe el blob y marca `available`; si falla,
marca `failed`. Si se exige captura garantizada se añadirá outbox y worker, sin
mantener una transacción SQL abierta durante el upload.

## Superficie pública inicial

Contratos compartidos separados para:

- crear, listar, obtener, renombrar y borrar threads;
- obtener mensajes paginados por cursor estable;
- iniciar una generación y obtener `runId`;
- observar deltas/eventos de un run mediante SSE;
- interrumpir una generación activa;
- recuperar el estado actual de un run.

El stream usa eventos discriminados y versionados: started, text delta,
checkpoint, completed, interrupted y failed. El evento de error solo contiene
un código público seguro. El contrato no expone mensajes internos de Effect AI.

Se usa un endpoint SSE autenticado por run, construido sobre infraestructura de
stream compartida con realtime pero con contrato propio. Cada evento incluye
`runId` y `sequence` monotónica; heartbeat evita timeouts de proxy y el cliente
deduplica. SSE sigue siendo best-effort: `Last-Event-ID` permite reanudar cuando
el buffer vivo conserva eventos, pero nunca promete replay durable. Tras gap,
reconnect o refresh, el cliente ejecuta GET autoritativo.

El primer despliegue soportado coordina generación en un único proceso público,
coherente con el fanout realtime actual. El lease persistente permite detectar
runs huérfanos. Antes de desplegar múltiples instancias se requiere un adapter
real de coordinación/fanout; no se promete cancelación cross-process hasta
entonces.

## Superficie Admin inicial

Nueva capability administrativa `aiOperations:read`; una capability separada
`aiOperations:interrupt` solo se añadirá si se decide permitir cancelación
operativa.

Pantallas:

1. Historial de runs con fecha, estado, duración, time-to-first-token, usuario,
   provider/model, tokens y coste.
2. Detalle del run con timeline de estados, correlación OTEL, thread y mensajes
   asociados mediante acceso administrativo explícito.
3. Estadísticas agregadas por periodo, provider/model, status y usuario.
4. Filtros por `runId`, `threadId` y usuario; no búsqueda libre sobre contenido
   en el primer incremento.

Admin lee queries dedicadas y paginadas desde `AI Operations`; no importa el
repository de Conversations ni construye SQL desde handlers. La visualización
de contenido debe registrarse como acción administrativa y podrá ocultarse por
defecto para minimizar exposición.

Los listados usan cursor estable, rangos máximos y timezone explícito. `null` en
coste significa desconocido y no cero. Admin presenta payloads `pending`,
`failed`, `expired` y `redacted` sin intentar reconstruirlos desde OTEL.

## Plan por fases

### Fase 0 — decisiones y documentación

- Añadir Conversations y AI Operations a la documentación DDD.
- Documentar privacidad, retención, acceso Admin y política de contenido.
- Fijar el provider/model inicial y el comportamiento de desarrollo sin API key.
- Definir si Admin solo observa o también interrumpe runs.
- Documentar SSE y recuperación después de reinicio.

Gate: revisión de arquitectura y contrato de amenazas/PII antes de persistir
contenido AI.

### Fase 1 — contratos de dominio y persistencia

- Crear modelos e IDs en `backend-domain` y wire schemas en `shared`.
- Definir los repository ports de Conversations y AI Operations.
- Añadir las tablas de threads, mensajes, Agent Runs, Agent Turns, Model
  Generations y Tool Executions, con checks, FKs e índices a Infra.
- Generar una migración Drizzle real; no escribir una migración manual ad hoc.
- Implementar adapters Drizzle compartidos por PGlite/PostgreSQL y memory para
  tests de Domain.
- Implementar operaciones atómicas start/finish/interrupt y paginación.

Gates: tests de invariantes del dominio, contrato de repository, migración desde
base vacía y poblada, PGlite y gate PostgreSQL.

### Fase 2 — generación AI y lifecycle de runs

- Incorporar Effect AI en Infra, aislando sus imports unstable y tipos.
- Implementar un adapter determinista para tests y uno configurable para dev.
- Implementar el caso de uso que prepara, ejecuta, checkpointa y finaliza runs.
- Propagar interrupción estructurada y timeouts; recuperar runs `running`
  abandonados al arrancar como `failed` o `interrupted` según política.
- Persistir uso y coste sin duplicar contenido.

Gates: streaming, cancelación, timeout, fallo antes/después del primer token,
doble submit concurrente, proceso reiniciado y respuesta parcial.

### Fase 3 — transporte público

- Añadir el grupo Conversations a `PublicApi`.
- Implementar handlers que solo adaptan transporte y errores.
- Añadir SSE autenticado por run y endpoint de recuperación.
- Aplicar límites de body, rate/concurrency y códigos públicos seguros.
- Componer Layers en server, dev-server y tests HTTP.

Gates: clientes tipados end-to-end, ownership, 404 no enumerable, desconexión,
reconexión y cancelación.

### Fase 4 — observabilidad operacional

- Crear la Layer OTLP común y proveerla desde cada composition root.
- Instrumentar los spans estables y enlazar el contexto HTTP con `ai.generate`.
- Guardar la correlación OTEL en Agent Runs y Model Generations cuando esté
  disponible.
- Añadir métricas de duración, TTFT, tokens, coste y runs activos con atributos
  de cardinalidad controlada.
- Verificar flush/shutdown y comportamiento cuando el collector no responde.

Gates: tracer in-memory en tests, ausencia de contenido sensible, exporter caído
sin afectar al producto y smoke local con Motel/collector.

### Fase 5 — backend y frontend Admin

- Añadir contratos `AdminAiOperationsApi` y handlers autorizados.
- Implementar queries de listado, detalle y agregados en Domain/Infra.
- Añadir navegación y pantallas Admin atom-first.
- Mostrar enlace/copy de trace ID, no depender de una URL de vendor fija.
- Añadir cancelación administrativa solo si se aprobó en Fase 0, con auditoría.

Gates: tests de capabilities, filtros/paginación, agregados sobre fixtures,
redacción de campos sensibles y comportamiento sin collector OTLP.

### Fase 6 — attachments y multimodalidad

- Crear lifecycle request-upload, PUT, confirm/finalize y attach-to-message.
- Mover el seam de object storage al lugar reutilizable requerido por Domain,
  conservando adapter local y preparando un segundo adapter real.
- Añadir metadata, ownership, hash, MIME detectado, límites y limpieza de
  huérfanos; no reutilizar `study_assets`.
- Traducir attachments a partes de prompt exclusivamente en `AiGeneration`.
- Añadir previews y estado de upload en frontend; Admin ve metadata redacted.

Gates: ownership, MIME spoofing, tamaño/cantidad, upload incompleto, cleanup,
imágenes/documentos soportados por modelo y tests browser de upload.

### Fase 7 — frontend de producto

- Incorporar en `packages/ui` el lote completo de chat components de shadcn
  usando la variante Radix UI: `MessageScroller`, `Message`, `Bubble`,
  `Attachment` y `Marker`.
- Adoptar también las utilities `scroll-fade` y `shimmer`, integrándolas en los
  tokens/utilities Tailwind propios de Proxus en vez de importar globalmente
  estilos shadcn ajenos al sistema de diseño.
- Usar `Marker` para representar estados ya derivados por producto: Agent Run
  iniciándose/interrumpido/fallido, Tool Execution, checkpoints, cambios de
  fecha y separadores. `Marker` no interpreta eventos ni conoce el dominio.
- Añadir las piezas de composer estrictamente visuales cuando shadcn las publique
  o cuando el producto las necesite; el lote de junio de 2026 solo cubre la capa
  de conversación, no el estado o transporte del composer.
- Tratar el código shadcn como código propio: adaptar imports, tokens, nombres y
  accesibilidad a `@proxus/ui`, sin conservar dependencias o estilos duplicados.
- Mantener `MessageScroller` limitado a viewport, anchoring de turns, seguimiento
  del streaming, prepend estable de historial y navegación entre mensajes. No
  conoce atoms, Thread, Agent Run, transporte, persistencia ni Effect AI.
- Añadir stories para thread vacío, streaming, lector desplazado, historial
  prependido, mensaje interrumpido, tool execution, attachments y thread largo.
- Crear `Atom.family` por thread y run en `frontend-core`.
- Derivar historial, estado streaming, interrupción y resultado parcial.
- Añadir rutas/listado/composer usando `@proxus/ui`.
- Recuperar estado autoritativo tras refresh o pérdida de SSE.

Gates: aislamiento entre threads, interrupción, reconexión, invalidación y
pruebas accesibles de estados observables; tests del scroller para conservación
de posición, `prefers-reduced-motion`, foco y anuncios live sin token-by-token.

## Orden recomendado de entregas

1. Documentación, contratos internos e IDs.
2. Migración y adapters de persistencia con tests.
3. Lifecycle de runs con adapter AI determinista.
4. Effect AI real y transporte público/SSE.
5. OpenTelemetry y ledger consultable.
6. Backend y UI Admin.
7. Attachments.
8. UI de producto.

Cada entrega debe ser revisable y no mezclar refactors generales. La primera
vertical demostrable termina en la fase 5: crear un thread mediante cliente
tipado, generar texto, interrumpir/reconectar y observar el run desde Admin.

## Plan ejecutable por entregas

Las siguientes entregas son la unidad recomendada de implementación y revisión.
Cada una deja interfaces y tests útiles; ninguna depende de código vacío creado
para entregas posteriores.

### Entrega 1 — decisiones normativas y contratos de privacidad

**Cambios**

- Crear `docs/architecture/conversations.md` y `docs/observability.md`.
- Actualizar `docs/architecture/domain-driven-architecture.md`, `docs/api.md` y
  `docs/testing.md`.
- Fijar retención separada para mensajes, metadata operacional y Observation
  Payloads; documentar redacción, borrado y quién puede ver contenido en Admin.
- Fijar límites iniciales de thread, mensaje, turn, tools y attachments.
- Registrar la decisión Effect AI primero y los criterios que justificarían un
  adapter `pi-ai`.
- Ejecutar un spike aislado con Effect `4.0.0-beta.98` para verificar versiones
  compatibles de Effect AI y OTEL, streaming, interrupción, tool calls, usage y
  propagación de un trace HTTP -> generation. El spike no entra en producción.

**Aceptación**

- El lenguaje coincide con `CONTEXT.md`.
- Están decididos provider/model de desarrollo y producción, política sin API
  key, contenido visible en Admin y capacidad de interrupción administrativa.
- Existe threat model para prompt injection mediante attachments y tools.
- La matriz de compatibilidad de dependencias queda fijada antes de modificar el
  lockfile productivo.

### Entrega 2 — object storage compartido y S3

**Cambios**

- Mover el seam `ObjectStorage` desde `apps/server` a un package backend
  reutilizable sin cambiar inicialmente su interface probada.
- Mantener el adapter local y sus rutas firmadas en el composition root público.
- Añadir adapter S3 con configuración de bucket, region, endpoint opcional,
  encryption, expiración de URLs y prefijos separados por propósito.
- Componer storage local en `dev-server` y S3 en los roots productivos que lo
  necesiten; Admin solo obtiene descargas mediante casos de uso autorizados.

**Aceptación**

- Suite contractual común para adapters local/S3 fake o emulator.
- Prevención de overwrite, path traversal, MIME/tamaño inválido y URLs expiradas.
- Ningún módulo de Domain importa AWS SDK, filesystem o URLs firmadas.

### Entrega 3 — schema normalizado y migración

**Cambios**

- Añadir tablas `conversation_threads`, `conversation_messages`,
  `conversation_agent_runs`, `agent_turns`, `model_generations`,
  `tool_executions` y `ai_observation_payloads`.
- Añadir enums/checks, FKs, índices, cursores estables y unique parcial para un
  Agent Run activo por thread.
- Añadir tabla versionada de precios por provider/model si el coste no llega
  autoritativamente desde el proveedor.
- Generar migración y snapshots con los scripts Drizzle reales.

**Aceptación**

- Migración desde base vacía y desde el snapshot anterior.
- Tests PGlite y PostgreSQL para constraints, ordering, carrera de dos runs,
  idempotencia de tool calls y coste en microdólares.
- No hay JSON transcript ni contenido AI completo en las tablas operacionales.

### Entrega 4 — módulo profundo Conversations

**Cambios**

- Crear `packages/backend-domain/src/modules/conversations/` con modelo, policy,
  repository ports, casos de uso y adapter memory de tests.
- Implementar create/list/get/rename/delete Thread y paginación de mensajes.
- Implementar reserva atómica, checkpoint, complete, fail e interrupt de Agent
  Run, además de lifecycle de turns/generations/tools.
- Añadir adapter Drizzle y Layers PGlite/PostgreSQL en `backend-infra`.
- Exportar solo la interface pública del módulo desde el package.

**Aceptación**

- Ownership fail-closed y errores de dominio tipados.
- Un único Agent Run activo; finalize/interrupt idempotentes por run ID.
- Ninguna transacción permanece abierta mientras se ejecuta AI o storage.
- Tests de reinicio con reconciliación de runs abandonados.

### Entrega 5 — generación determinista y loop agéntico mínimo

**Cambios**

- Definir el seam semántico de generación consumido por Conversations.
- Crear adapter determinista capaz de emitir texto, tool call, retry, fallo e
  interrupción para probar el loop completo sin red.
- Implementar el loop con límites de máximo turns, máximo tool calls, timeout,
  presupuesto de tokens/coste y cancelación estructurada.
- Registrar Agent Turn, Model Generation y Tool Execution antes de ejecutar sus
  efectos externos; finalizar cada estado de forma idempotente.
- Incluir una tool fixture sin efecto externo para demostrar el protocolo.

**Aceptación**

- Caso simple `1 run -> 1 turn -> 1 generation`.
- Caso agéntico `generation -> tool -> generation final`.
- Detección de tool loop, retry limitado, timeout e interrupción durante tool o
  streaming.

### Entrega 6 — Effect AI y captura PostgreSQL + object storage

**Cambios**

- Añadir versiones exactas compatibles de Effect AI/provider packages fuera de
  Domain y aislar imports unstable.
- Implementar el adapter real y mapping de mensajes, tools, streaming, usage,
  finish reasons y errores seguros.
- Implementar captura de Observation Payloads: metadata `pending`, JSON
  versionado/comprimido en object storage y transición `available | failed`.
- Persistir provider/model/tokens/coste/timings en `model_generations`.
- Mantener la respuesta del producto independiente del éxito de la captura.

**Aceptación**

- Streaming real con modelo de desarrollo configurable.
- Payload input/output verificable por hash y no duplicado en PostgreSQL.
- Fallo de storage no falla la generación; fallo del proveedor sí finaliza el
  run y mensaje con estado coherente.
- Adapter `pi-ai` queda fuera hasta que exista una capability diferencial.

### Entrega 7 — contratos públicos, HTTP y SSE

**Cambios**

- Añadir wire schemas Conversations en `packages/shared` y agregar el grupo a
  `PublicApi`.
- Añadir handlers en `backend-transport`, siempre handler -> caso de uso.
- Exponer comandos HTTP y SSE autenticado por run, con GET autoritativo para
  recuperación y cursor para mensajes.
- Componer Layers en `server`, `dev-server` y los harnesses HTTP.
- Componer también preview-server si la superficie de chat forma parte del
  artifact preview; en caso contrario añadir un surface test que demuestre su
  ausencia deliberada.
- Propagar cancelación del stream a la fiber del Agent Run.

**Aceptación**

- Tests con cliente tipado para create/list/get/ask/watch/interrupt.
- Ownership, no enumeración, body limits y códigos públicos seguros.
- Disconnect, reconnect y refresh reconstruyen estado desde PostgreSQL.

### Entrega 8 — sistema visual de chat en `packages/ui`

**Cambios**

- Crear configuración shadcn específica para `packages/ui`; no usar la de Admin.
- Importar la variante Radix de `MessageScroller`, `Message`, `Bubble`,
  `Attachment` y `Marker`, más `scroll-fade` y `shimmer`.
- Adoptar `@shadcn/react/message-scroller` para el comportamiento headless y
  adaptar las capas visuales a tokens, imports y nombres de Proxus.
- Construir composer visual con primitives existentes de `@proxus/ui`.
- Exportar las primitives y añadir stories de todos sus estados relevantes.

**Aceptación**

- El package no importa atoms, transport, Effect AI ni tipos de Conversations.
- Scroll estable durante streaming/prepend, navegación por ID persistente,
  reduced motion, foco correcto y live region sin anunciar cada token.
- Storybook cubre vacío, mensajes agrupados, rich content, streaming, tools,
  markers, errores, attachments y thread largo.

### Entrega 9 — frontend-core y producto Web

**Cambios**

- Crear módulo Conversations neutral de plataforma en `frontend-core`, con
  application client y `Atom.family` por Thread/Agent Run.
- Modelar queries, mutations, stream, interrupción, reconnect y estado parcial
  mediante Effect Atom.
- Crear adapter HTTP/SSE en `apps/web/src/platform`.
- Añadir rutas, sidebar de threads, transcript, composer, estados de Agent Turn
  y Tool Execution usando exclusivamente `@proxus/ui` para primitives.

**Aceptación**

- Aislamiento entre threads, invalidación correcta y URL basada en IDs branded.
- El input permanece responsivo durante streaming y solo cambia el mensaje en
  vuelo; no se copia estado remoto a `useState` mediante effects.
- Tests de atoms con Layers y tests de comportamiento accesible de la pantalla.

### Entrega 10 — attachments y multimodalidad

**Cambios**

- Añadir assets de conversación y relación mensaje-attachment sin reutilizar
  `study_assets`.
- Implementar request upload, PUT firmado, confirm/finalize, attach y cleanup.
- Detectar MIME/size/hash en servidor y aplicar ownership, count y allowlists.
- Resolver blobs y traducirlos a partes multimodales solo dentro del adapter AI.
- Integrar `Attachment` en composer, mensaje y Admin con estados de upload.

**Aceptación**

- Imágenes y archivos permitidos llegan al modelo sin base64 en el comando.
- MIME spoofing, objeto ausente, upload incompleto y attachment ajeno fallan
  cerrados.
- Tests browser cubren selección, progreso, eliminación, retry y envío.

### Entrega 11 — OpenTelemetry transversal

**Cambios**

- Añadir dependencias OTEL exactas compatibles con la versión Effect del
  workspace y una Layer común configurable.
- Proveerla al final de `server`, `admin-server` y `dev-server` con resources
  distintos y shutdown scoped.
- Instrumentar HTTP -> Agent Run -> Agent Turn -> Model Generation/Tool
  Execution -> persistence/storage, siguiendo atributos GenAI compatibles.
- Añadir métricas de throughput, errores, TTFT, duración, tokens y coste con
  cardinalidad controlada.

**Aceptación**

- Collector caído no afecta al producto.
- Tests con tracer memory verifican nombres, jerarquía y redacción.
- Smoke Motel/OTLP muestra una traza completa correlacionable con PostgreSQL.

### Entrega 12 — AI Operations backend y Admin

**Cambios**

- Añadir módulo de queries `AI Operations`, contratos `AdminApi`, adapters
  Drizzle y handlers administrativos.
- Incorporar capabilities read, content-read e interrupt separadas.
- Añadir historial, detalle/timeline, agregados, filtros y correlación OTEL.
- Leer Observation Payloads mediante caso de uso auditado y URL corta o response
  redacted; no exponer keys del bucket.
- Cancelar mediante Conversations, nunca actualizando directamente una fila.

**Aceptación**

- Admin funciona aunque OTEL esté desactivado o el collector no esté disponible.
- Listados y agregados no descargan payloads S3 ni provocan N+1.
- Lectura de contenido y cancelación requieren capability y dejan auditoría.
- Costes agregados cuadran con las generaciones fixture.

### Entrega 13 — endurecimiento y rollout

**Cambios**

- Añadir feature flags para UI, generación real, attachments y acceso Admin.
- Definir budgets, rate limits, concurrencia por usuario y circuit breakers.
- Añadir cleanup/reconciler de runs, uploads y Observation Payloads expirados.
- Documentar dashboards, alertas, runbook, borrado de usuario y recuperación.
- Ejecutar validación global y gate PostgreSQL real.

**Aceptación**

- Rollout gradual deterministic/dev -> usuarios internos -> porcentaje público.
- Alertas para errores, latencia, coste anómalo, runs huérfanos y captura fallida.
- Borrado/retención elimina o anonimiza PostgreSQL y object storage de forma
  verificable.

## Dependencias y trabajo paralelizable

```text
Entrega 1
├── Entrega 2 -> Entrega 6 -> Entrega 10
├── Entrega 3 -> Entrega 4 -> Entrega 5 -> Entrega 6 -> Entrega 7
└── Entrega 8 -------------------------------> Entrega 9

Entrega 7 + Entrega 8 -> Entrega 9
Entrega 6 -> Entrega 11
Entrega 3 + Entrega 6 + Entrega 11 -> Entrega 12
Entregas 9-12 -> Entrega 13
```

La Entrega 8 puede avanzar tras fijar el vocabulario visual y los tokens, porque
su interface recibe props normales. No debe inventar modelos provisionales que
luego se filtren a `frontend-core`.

## Definition of Done de la integración completa

- Un usuario crea, lista, renombra y elimina threads propios.
- Puede enviar texto, imágenes y archivos, observar streaming, interrumpir y
  recuperar el resultado tras desconexión o refresh.
- El runtime ejecuta un loop agéntico limitado con tools idempotentes y muestra
  turns/tools mediante los chat components compartidos.
- PostgreSQL contiene mensajes autoritativos y metadata completa de runs,
  turns, generaciones, tools, tokens, coste y timings.
- Object storage contiene payloads técnicos y attachments con hash, retención,
  ownership y acceso autorizado; producción usa S3 y desarrollo adapter local.
- OTEL presenta la jerarquía completa sin contenido sensible y no es dependencia
  funcional de Admin.
- Admin lista, filtra, agrega e inspecciona ejecuciones; acceso a contenido y
  cancelación están separados, autorizados y auditados.
- Tests Domain, adapters, HTTP, atoms, componentes y browser cubren invariantes,
  carreras, interrupción, reconexión, uploads y seguridad.
- `pnpm validate:pr` y el gate PostgreSQL 17 pasan sin allowlists nuevas.

## Validación prevista

Por incremento:

```bash
pnpm effect:diagnostics
pnpm --filter @proxus/shared test
pnpm --filter @proxus/backend-domain test
pnpm --filter @proxus/backend-infra test
pnpm --filter @proxus/backend-transport test
pnpm --filter @proxus/backend-admin-transport test
pnpm --filter @proxus/server test
pnpm --filter @proxus/admin-server test
pnpm --filter @proxus/admin typecheck
pnpm --filter @proxus/admin test
```

Antes de integrar la vertical:

```bash
pnpm validate:self-test
pnpm static
pnpm test
pnpm build
```

Además, la persistencia debe pasar el job PostgreSQL 17 y observabilidad necesita
un smoke explícito contra un collector OTLP local.

## Riesgos abiertos

- El engine workflow experimental del ejemplo aporta replay/coordinación, pero
  adoptarlo en el primer incremento aumentaría el riesgo junto a Effect v4 beta.
  El plan usa invariantes persistentes y fibers scoped; se reevalúa si aparecen
  trabajos duraderos que deban sobrevivir al proceso.
- Guardar contenido para soporte/Admin requiere una política explícita de acceso,
  retención y borrado.
- Streaming y checkpointing frecuente pueden amplificar escrituras; debe medirse
  antes de fijar el intervalo.
- Costes cambian con el tiempo: necesitan versión de tarifa, no constantes
  dispersas.
- Una instalación multi-instancia necesitará un adapter de coordinación/fanout
  antes de prometer interrupción inmediata desde otro proceso.
