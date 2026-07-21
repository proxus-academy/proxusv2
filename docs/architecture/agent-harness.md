# Arquitectura del agent harness

> **Estado:** normativa de arquitectura
> **Alcance:** agentes, DSL, ejecución durable, sandboxes e integraciones
> **Effect:** `4.0.0-beta.98`; `effect/unstable/ai` queda localizado en un adapter

## Propósito y límites

Proxus posee el ciclo de vida, la durabilidad, la autorización y los eventos de sus agentes. Effect AI aporta el protocolo de modelos (`LanguageModel`, `Model`, `ExecutionPlan`, `Prompt`, `Response`, `Tool` y `Toolkit`), pero no es la autoridad del producto.

El harness es **Effect-first y DSL-first**:

- `@proxus/agent-harness` contiene contratos, schemas, compilación y semántica de ejecución sin SDKs de proveedor ni mecanismos de almacenamiento.
- `@proxus/backend-infra/agent-harness/*` contiene adapters concretos de modelos, stores, sandboxes, skills, GitHub, artefactos y telemetría.
- Cada ejecutable elige y compone Layers. No existe selección implícita de adapters en el core.
- Las operaciones de producto entran por una DSL declarada, no por toolkits arbitrarios.

La superficie interna visible por el modelo es:

```text
loadSkill({ name }) -> string
executeDsl({ source }) -> string
```

La delegación, cuando está habilitada, es una operación terminal de la DSL:

```text
agents.delegate({ task }) -> string
```

## Vocabulario

- **AgentDefinition:** prompt, skills permitidas, `DslDefinition`, perfil lógico de modelo y límites.
- **ModelProfile:** ID lógico que un composition root resuelve a un `LanguageModel` o `ExecutionPlan`. En la primera versión no incluye flags ambiguos como `largeContext`; cualquier requisito real debe ser una capacidad comprobable y documentada por el adapter.
- **Skill:** descriptor tipado y contenido Markdown cargado progresivamente. Enseña; no ejecuta ni concede autoridad.
- **DslDefinition:** grafo contextual de raíces, transiciones, schemas y operaciones.
- **CompiledDslPlan:** representación pura, versionada y persistible de una expresión ya validada.
- **DslHandler:** implementación Layer-provided de una operación.
- **Session:** conversación durable con historia append-only y una rama activa.
- **Run:** ejecución aceptada dentro de una sesión.
- **Turn:** una invocación al modelo y el asentamiento de las acciones resultantes.
- **JournalEvent:** hecho operacional ordenado de un run.
- **Checkpoint:** snapshot reconstruible de un run hasta una secuencia del journal.
- **AgentStore:** port transaccional que persiste sesiones, runs, journal y checkpoints; no es un almacén de prompts ni una API SQL genérica.
- **Sandbox:** workspace y capacidad de procesos con ciclo de vida explícito.

## Definición de agentes y modelos

Una definición es un valor inmutable y tipado. El agente referencia un perfil lógico; no elige proveedor, credenciales ni fallback:

```ts
const EngineeringAgent = Agent.define({
  id: "engineering",
  prompt: { instructions: "..." },
  skills: [IssueInvestigation],
  dsl: EngineeringDsl,
  model: CodingModel,
  runPolicy: {
    maxTurns: 30,
    maxDslExecutions: 50,
    maxDelegationDepth: 1
  }
})
```

`CodingModel` significa una política estable propiedad de la aplicación. El adapter Effect AI la traduce a modelos concretos. Si en el futuro una definición necesita visión, tools o una ventana mínima de contexto, se añade una capacidad tipada con semántica verificable; no se usan booleanos aspiracionales.

## DSL y nodo base

Toda fuente es una expresión de una sola línea y empieza en **una raíz declarada**:

```text
github.repository("proxus").issue(431).inspect()
repository.search({ query: "AgentStore", paths: ["packages"] })
agents.delegate({ task: "Revisa el issue sin modificar archivos." })
```

No se antepone un nodo universal como `engineering.`. `executeDsl` ya selecciona una única `DslDefinition` para el agente, por lo que ese prefijo sería ruido y no aportaría aislamiento. El propio `DslDefinition` es el nodo base lógico y registra un conjunto cerrado de raíces (`github`, `repository`, `validation`, `agents`). Dos raíces con el mismo nombre no pueden coexistir en una definición.

No hay variables, asignaciones, múltiples expresiones, saltos de línea, control de flujo, imports, nombres dinámicos, JavaScript ni `return`. El valor terminal se renderiza automáticamente como texto.

La compilación completa ocurre antes del primer efecto:

```text
límites léxicos
→ parseo de una cadena
→ resolución de raíz y transiciones contextuales
→ decode de todos los argumentos con Schema
→ validación de terminal y coste
→ CompiledDslPlan puro
```

El plan contiene IDs estables de operación, inputs decodificados, versión de definición, clasificación read/write, requisitos de aprobación y hash. No contiene handlers, clients, Layers, secretos ni closures.

## Ejecución contra servicios

Una operación DSL se ejecuta siempre contra un servicio, nunca directamente contra SQL, variables de proceso o un SDK. El handler recibe un `OperationContext` construido por el runtime y captura sus servicios al construir su Layer.

```text
CompiledOperation
→ OperationContext (actor, tenant, run, workspace, variables permitidas)
→ Policy.authorize
→ Approval.verify, si aplica
→ servicio/capability
→ decode del resultado
→ journal
```

Los valores runtime se resuelven mediante servicios tipados. Por ejemplo, `RunVariables` expone únicamente variables declaradas para ese agente/deployment; una ausente produce `MissingRunVariable` antes de invocar el servicio externo. Credenciales no son run variables y nunca se entregan al handler como strings ambientales: pertenecen al adapter host-side que las consume.

Los handlers de producto llaman servicios públicos del bounded context. Los handlers de integración llaman ports/capabilities del harness. Ningún handler importa un transport o un repository adapter.

La DSL de ingeniería declara `GitHubReader`, `RepositoryWorkspace`, `ValidationCapability`, `LocalGit` y `GitHubPublisher` como ports host-side. Cubre inspección de issues y PRs, búsqueda/lectura/status/diff/patch, discovery/run/output de validación, branch/commit local y las llamadas publicables push/PR/comment/review. Sus requests y responses usan schemas cerrados, paths relativos confinados y tamaños acotados; no tienen campos de credential, token, header o environment. Los campos no declarados de una respuesta se eliminan al decodificarla antes de construir el resultado DSL. `GitHubPublisher` se implementa mediante un broker host-side de GitHub App. Reader y writer tienen servicios, configuración, App/installation y permisos separados; un deployment read-only no construye el writer. Ambos resuelven credenciales de instalación de vida corta dentro del host, las mantienen como `Redacted` y las refrescan antes de expirar. No se pasan tokens, headers ni variables de entorno al sandbox.

El publish seguro vuelve a comprobar scope de instalación y SHAs inmediatamente antes del efecto externo. Push usa un broker/credential-helper host-side; PRs, comentarios y reviews llevan un marcador estable derivado de la evidencia aprobada, consultan primero el recurso y retornan el resultado previo tras un retry. Un cambio de SHA falla como conflicto y exige recompilar/reaprobar; no se hace un retry ciego. Los errores HTTP externos se traducen a errores seguros sin cuerpos, tokens o URLs sensibles.

## Autorización: reparto de responsabilidades

La autorización no pertenece exclusivamente a Infra. Se divide deliberadamente:

1. **El transporte autentica** y produce una identidad verificada; no decide permisos de operación.
2. **El runtime construye `OperationContext`** con actor, tenant, agente, run y autoridad delegada inmutables.
3. **`OperationPolicy` (core/domain) decide** si esa operación concreta y esos recursos están permitidos y si requieren aprobación. La decisión queda en el journal.
4. **El servicio de producto vuelve a imponer invariantes y scope**. Un DSL handler no evita la autorización normal del caso de uso.
5. **Infra atenúa capacidades**: instala solo adapters/credenciales necesarios, limita repositorios de una GitHub App, red, filesystem y recursos del sandbox. Esto es defensa en profundidad, no la fuente de la regla de producto.

La autoridad efectiva es la intersección, nunca la unión, de deployment, agente, actor/tenant, instalación externa, autoridad heredada y operación/recurso. Si cualquier capa carece de información, falla cerrado.

No se construye un Layer distinto por usuario o por cada permiso. El Layer aporta el mecanismo estable; `OperationContext` aporta el scope por run y `OperationPolicy` evalúa cada llamada. Un composition root sí debe omitir por completo adapters que ese deployment nunca permite, por ejemplo el writer de GitHub en un agente read-only.

Las mutaciones consecuenciales requieren una aprobación ligada a `runId`, operation ID, hash del plan, hash de los argumentos, hash del diff y SHAs base/head esperados. Estos campos forman una comparación exacta; cambiar cualquiera invalida la aprobación antes de llamar al publisher. El modelo no crea, amplía ni interpreta permisos.

## Stores y durabilidad

`AgentStore` es un port profundo del core, implementado por memory, PGlite o PostgreSQL. Encapsula commits atómicos que deben mantener juntas estas invariantes:

```text
versión esperada del run/session
+ nuevas entries/eventos
+ nuevo estado y activeLeaf
+ checkpoint opcional
= un commit
```

No expone queries SQL, filas, Drizzle ni transaction handles. Tampoco sustituye a:

- `ArtifactStore`, que guarda diffs/logs grandes con retención y ACL;
- OpenTelemetry, que exporta señales operacionales;
- la conversación model-visible, que se reconstruye desde entries autorizadas.

Las sesiones son árboles append-only mediante `parentEntryId`; `activeLeafId` selecciona la rama. Cada append o cambio de hoja incrementa una versión optimista de sesión. Un fork añade un hijo a cualquier entry existente y lo convierte en hoja activa sin alterar la rama anterior. La ancestry se reconstruye siguiendo padres hasta la raíz y se devuelve en orden raíz-hoja; activaciones de skills y compactaciones solo son efectivas si están en esa cadena.

`SkillActivated` persiste `skillId` y el hash exacto del contenido cargado. Para un skill repetido, gana la última activación de la ancestry seleccionada; cambiar de rama no reutiliza activaciones de una rama hermana. Una compactación añade una entry cuyo `compactedThroughEntryId` debe ser ancestro de su padre. Al reconstruir contexto se usa la compactación válida más reciente, se incorpora su resumen y se retienen únicamente las entries posteriores; las entries fuente nunca se borran o reescriben. Los snapshots del adapter memory contienen el árbol completo, incluidas ramas inactivas, para probar reconstrucción tras reinicio, pero no sustituyen un adapter persistente.

Los eventos durables se persisten antes de notificar. Además de la secuencia por run, el journal asigna un `cursor` global, monotónico y durable; un consumidor reanuda con `replay(afterCursor)` y nunca depende de memoria del proceso.

PostgreSQL coordina workers mediante una fila de lease por run y un fencing token monotónico. `claimNext` usa bloqueo con `SKIP LOCKED`; cada heartbeat debe coincidir en owner, token y lease no expirado. Reclaim incrementa el token, por lo que heartbeats o releases tardíos fallan con `ClaimLost`. Al arrancar, el worker elimina leases expirados y vuelve a admitir esos runs. PGlite y memory implementan el mismo contrato para pruebas deterministas, pero solo PostgreSQL promete coordinación multi-proceso. PGlite y PostgreSQL ejecutan la misma implementación de `AgentStore` sobre Effect SQL y el mismo schema y migraciones PostgreSQL canónicas definidos con Drizzle; sus Layers solo construyen el cliente concreto. No existe un dialecto ni una migración SQLite paralela.

La API de Proxus y los workers pueden compartir la base de datos y las tablas `agent_*`, pero usan pools, `application_name` y roles runtime distintos. El rol de API admite y consulta runs autorizados; el rol de worker reclama, hace heartbeat, checkpoint y finaliza; un rol migrator separado posee DDL. Compartir base no concede al worker acceso general a otros bounded contexts.

El worker de producto comparte por identidad el Layer del pool entre el migration check y `PostgresAgentStore`. Aplica la política productiva de **no migrar al arrancar**: falla si existen migraciones pendientes. En shutdown, el scope deja de reclamar, interrumpe el processor y heartbeat activos, intenta liberar el lease con el token vigente y finalmente cierra el pool.

## Sandboxes intercambiables

El core define un `SandboxProvider` Effect service. Un composition root aporta exactamente un Layer:

```text
SandboxProvider
  acquire(SandboxRequest) -> scoped SandboxHandle

SandboxHandle
  workspace identity
  filesystem capability
  process capability
  artifact transfer
  metadata segura del provider
```

`SandboxRequest` describe requisitos, no un proveedor: repositorio/materialización, toolchain, límites, red permitida, persistencia y etiquetas de policy. El agente y el modelo no seleccionan `local`, Daytona o Google Cloud. El deployment resuelve esos requisitos mediante un adapter configurado.

Adapters previstos:

- **virtual/memory:** tests ligeros, sin asumir que es una frontera de red;
- **local:** desarrollo confiable y runners CI desechables; opera sobre host y explícitamente no es aislamiento;
- **container local:** integración y desarrollo cercano a producción;
- **Daytona:** sandbox remoto administrado;
- **Google Cloud:** adapter remoto sobre el producto elegido (por ejemplo, jobs/VMs aisladas), sin filtrar su SDK al core.

Cada adapter implementa la misma suite de contrato: materialización, path confinement, exec/cancel/timeout, output bounds, upload/download y destrucción idempotente. Las capacidades opcionales se anuncian como datos (`networkIsolation`, `snapshot`, `resume`, toolchains) y `acquire` falla con `UnsupportedSandboxRequirement` si no puede cumplirlas. No se degrada silenciosamente de remoto a local.

La selección ocurre en el composition root mediante Layers explícitos, siguiendo la idea de Flue de separar virtual, local y remote sandboxes, pero manteniendo Effect Scope como propietario del lifecycle. Configuración dinámica por tenant solo se admite mediante un router host-side allowlisted que elige entre providers preinstalados; nunca mediante texto generado por el modelo.

El sandbox pertenece al run padre. Los hijos comparten por identidad su `SandboxHandle`, se ejecutan bajo un semáforo secuencial y no lo finalizan. El contrato core mínimo solo expone identidad/workspace y capacidades confinadas de lectura, escritura y proceso; `SandboxProvider.acquire` es scoped. Los providers concretos y sus mecanismos de aislamiento pertenecen a Infra y no forman parte de este incremento.

## Delegación

`agents.delegate({ task })` crea un run hijo durable ligado por `parentRunId` y `parentStepId`, reserva hasta el presupuesto todavía disponible del padre y espera su finalización. El hijo hereda workspace, actor/tenant, autoridad, skills y DSL efectiva, pero recibe una copia inmutable del grafo sin la operación estable `agents.delegate`. Además el runtime rechaza de forma independiente cualquier llamada cuya profundidad ya haya alcanzado `maxDelegationDepth`; por tanto, la prohibición no depende solo de ocultar sintaxis.

La reserva limita cada dimensión del hijo al mínimo entre su límite solicitado y la disponibilidad del padre. Al terminar se carga al padre únicamente el uso real del hijo, liberando implícitamente la parte no usada; `maxChildren` se verifica contra los eventos durables de admisión. Las delegaciones comparten un semáforo y no pueden escribir concurrentemente en la primera versión.

El valor devuelto al caller padre contiene únicamente `{ text }`. El output del run hijo, sus eventos, detalles operacionales y usage permanecen consultables internamente por `childRunId`, sin incorporarse al resultado model-visible. Los eventos hijo heredan su linkage durable. Cancelar el padre gana una carrera contra la ejecución, solicita cancelación durable del hijo, lo interrumpe y lo lleva a `Cancelled`; el hijo no posee ni libera el scope del sandbox compartido.

## Observabilidad: dónde vive cada dato

Hay cuatro destinos con responsabilidades distintas:

| Dato | Propietario | Contenido | Regla |
| --- | --- | --- | --- |
| Estado, journal, approvals, checkpoint | `AgentStore` en backend-infra | hechos necesarios para recuperar/auditar el run | durable, ordenado, transaccional |
| Diffs, logs y resultados grandes | `ArtifactStore` en backend-infra | blobs referenciados por ID/hash | ACL y retención propia |
| Traces, metrics y logs operacionales | OpenTelemetry adapter en backend-infra | latencia, outcome, uso, IDs correlacionables y baja cardinalidad | no es fuente de verdad ni mecanismo de replay |
| Proyección de inspector | función pura en core, transport/UI fuera del core | vista derivada de store + metadatos de artefactos | no persiste una segunda verdad |

El core define eventos y campos seguros. Infra implementa persistencia y exportadores. El composition root configura destino, sampling, redacción y retención. OpenTelemetry no almacena el estado necesario para reanudar y el repository no acumula spans o deltas de streaming que no hagan falta para recuperación/auditoría.

Por defecto no se exportan prompts, completions, razonamiento, argumentos/resultados raw, secretos ni contenido de cliente. Los deltas live son best-effort; el mensaje final y los transitions durables son autoritativos.

### Privacidad, ACL y retención operativa

La instrumentación usa un vocabulario cerrado de eventos y dimensiones (`type`, `outcome`, operación estable, categoría de error y buckets). IDs de run/session/tenant, paths, comandos, texto libre y mensajes de error no son labels métricos. Infra aplica una allowlist y redacción antes de console u OTLP; el collector vuelve a borrar campos sensibles como defensa en profundidad. Los payloads de debug están deshabilitados por defecto. Habilitarlos exige cifrado, destino separado, rol `operator`, auditoría de acceso y una ventana explícita menor o igual a 24 horas.

Cada artefacto lleva tenant, run, clasificación y `expiresAt`. Leer requiere rol `reader` y coincidencia tenant/run; eliminar y ejecutar cleanup requiere rol `retention`. La política inicial de producto es: artefactos normales 30 días, debug cifrado 24 horas y journal durable 90 días. Cleanup es idempotente, por tenant, y solo considera runs terminales. Nunca elimina journal/checkpoint de un run activo, suspendido, reclamable o sujeto a legal hold. Antes de purgar journal se conserva el outcome agregado y la evidencia de aprobación exigida por auditoría, sin prompts ni resultados raw. El adapter filesystem implementa purge de artefactos; el job PostgreSQL de journal debe ejecutar el plan core con un principal de retención y lotes acotados, no `DELETE` ad hoc desde transportes.

La proyección de inspector es pura y recibe únicamente facts seguros. No lee `RunRecord.context`, `output`, `failure` ni `JournalEvent.detail`; muestra objetivo resumido, perfil lógico de modelo, skills, IDs/planes DSL estables, operaciones, recursos clasificados, paths relativos, comandos normalizados, validaciones, árbol de hijos, presupuestos, referencias ACL de artefactos y respuesta final explícitamente publicada. Su resultado no contiene HTML ni payloads de transporte.

### Despliegue de observabilidad

`deploy/observability/agent-harness-otel-collector.yaml` es una configuración desplegable del Collector con OTLP/HTTP, memory limiter, batch, redacción secundaria, colas/retry y generación de métricas de baja cardinalidad desde spans. `agent-harness-dashboard.json` se importa en Grafana y `agent-harness-alerts.yaml` en Prometheus-compatible rulers. El composition root de producto debe proporcionar `agentOtlpLayer`; tests y CLI usan console/no-op. `PROXUS_OTLP_BACKEND_ENDPOINT` y `PROXUS_OTLP_BACKEND_TOKEN` pertenecen al Collector, no al proceso agente. El Scope exterior posee exporter y garantiza flush con timeout en shutdown; una caída del exporter no cambia el resultado del run.

## Composición por deployment

```text
Transport → Harness → RunEngine → AgentStore
                         ├── ModelTurnAdapter
                         ├── DslCompiler → DslExecutor → Policy → Handlers
                         ├── Skills
                         ├── SandboxProvider
                         ├── ArtifactStore
                         └── Telemetry
```

- **Tests:** memory store, scripted model, memory skills, temporary sandbox y telemetry capturada.
- **Local/CI:** PGlite con las migraciones PostgreSQL canónicas, skills filesystem, local/container sandbox y salida console/JSON.
- **Producto/Google Chat:** PostgreSQL, worker con leases/fencing, sandbox remoto, artefactos durables y OpenTelemetry.

Google Chat liga `tenant + space + thread` a una sesión y deduplica delivery IDs. El core solo define direcciones, eventos públicos y su proyección segura; la verificación de firma/token, payloads, cards y HTTP permanecen en `apps/google-chat-agent`. El inbox, binding, cursor de proyección, resoluciones y claves de posts se persisten antes del side effect. Un mensaje llegado durante un run queda en cola y solo se admite tras un provider-turn asentado. Los callbacks de aprobación deben coincidir con tenant/thread y actor autenticado; cada card y respuesta final usa una clave idempotente.

GitHub usa Apps con credenciales reader/writer separadas cuando sea viable; las credenciales viven en el adapter host-side y nunca dentro del sandbox.

## Estado y límites de runs

```text
Queued → Claimed → Running ⇄ WaitingForApproval
                     ↓
          Succeeded | Failed | Cancelled | TimedOut | BudgetExhausted
```

Se procesa un provider turn por vez y se persiste antes de decidir `Continue | Suspend | Complete | Fail`. Son obligatorios límites de turns, DSL executions, operaciones, deadline, tokens/coste, retries, contexto, output y children. Shutdown interrumpe trabajo, deja de admitir, checkpointa cuando es seguro y ejecuta finalizers scoped.

## Dependencias permitidas

```text
@proxus/agent-harness ← @proxus/backend-infra/agent-harness/* ← apps/*
                    ↖ handlers de dominio/producto              ↗
```

- Core no importa Node, SQL, Drizzle, SDKs cloud, transports ni providers AI.
- La única implementación que importa `effect/unstable/ai` es el adapter localizado; los contratos core propios no duplican `LanguageModel`.
- Infra no define reglas de autorización de producto.
- Apps son los únicos lugares que conocen simultáneamente transport, core y adapters.
- Se exportan subpaths estrechos; no se publica un barrel que permita importar internals de todos los adapters.

## Referencias de diseño

- Effect AI y recursos scoped: fuentes locales en `.repos/effect-smol` fijadas al mismo beta que el workspace.
- Flue sandboxes: separación explícita entre virtual, local y remote; Proxus adopta la forma del seam, no la dependencia ni su runtime.
- OpenCode: provider-turn boundaries, snapshots de capabilities y autorización en dos etapas; no se copia su processor legacy.
- agent-orm: validación completa antes del primer efecto.
- Pi: inspiración para árbol append-only, compactación y retorno textual de hijos; no es dependencia.
