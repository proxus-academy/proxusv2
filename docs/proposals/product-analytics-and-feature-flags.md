# Propuesta: feature flags deterministas y product analytics

## Estado

Implementada parcialmente y superada para feature flags por la decisión de snapshots frontend-only descrita al final. La sección histórica de cookie/verificación servidor no es normativa.

## Objetivo y límites

Incorporar dos capacidades relacionadas por los experimentos, pero separadas arquitectónicamente:

1. un catálogo pequeño de feature flags públicas, tipadas y deterministas;
2. ingestión best effort de eventos de producto detrás de un servicio de aplicación y un repository port.

El primer caso es un CTA visual de registro. Las flags cliente no conceden permisos, acceso a datos, límites ni capacidades autoritativas. Product analytics no sustituye logs, métricas operativas, auditoría ni una outbox.

## Alcance del primer slice

```text
- contrato compartido/API: sí
- persistencia y repositories: sí, solo analytics
- services/casos de uso: sí, solo analytics
- handlers HTTP: sí, ingestión analytics y bootstrap de flags si resulta necesario
- frontend core/atoms: sí
- adapters frontend web: solo capacidades de navegador realmente usadas
- UI, pantallas y rutas: CTA piloto
- tests y fixtures: sí
- documentación: sí
```

Quedan fuera del primer slice: consola remota de flags, segmentación dinámica, assignments persistidos, motor genérico de experimentación, worker separado, JSONL, backfill, tabla curada y análisis estadístico automatizado. Se añadirán únicamente con un caso de uso real.

# Feature flags

## Módulo compartido, no servicio prematuro

La definición pública y el evaluador son funciones puras en `@proxus/shared`; no necesitan `Context.Service`, Layer, repository ni módulo servidor mientras no exista comportamiento Effect o configuración remota.

```text
packages/shared/src/modules/feature-flags/
  definitions.ts
  model.ts
  evaluator.ts
  index.ts

packages/frontend-core/src/feature-flags/
  atoms.ts

packages/frontend-web/src/feature-flags/
  overrides.web.ts       # solo si el piloto necesita persistencia dev
```

`packages/shared` no importa React, Effect Atom, navegador, Node ni configuración. Si aparece una flag exclusivamente servidor, vivirá en un entrypoint server-only que no sea alcanzable desde el bundle cliente. No se introducirá desde el inicio un DSL genérico de scopes, segmentos o providers.

## Definición mínima

El piloto puede expresarse con una definición concreta y readonly:

```ts
export const RegistrationCta = {
  key: "registration.cta",
  allocationVersion: 1,
  assignmentUnit: "installation",
  default: "control",
  variants: [
    ["control", 5_000],
    ["benefitCopy", 5_000],
  ],
} as const
```

Los pesos son basis points enteros en `0..10_000`, suman exactamente `10_000` y el array fija el orden canónico. El constructor/schema de definiciones rechaza keys repetidas, pesos inválidos e intervalos vacíos accidentales. Solo se generalizará a boolean, server/shared scope o elegibilidad contextual cuando exista una segunda necesidad que demuestre esa interfaz.

## Identidad y hashing

La unidad inicial es una instalación. El servidor emite una cookie first-party:

```text
proxus_feature_flag_subject=v1.<uuid-v4>.<mac>
```

La cookie es `HttpOnly; Secure; SameSite=Lax; Path=/` y tiene una retención aprobada. El backend verifica la MAC, ignora valores inválidos y nunca acepta como autoritativo un subject enviado en body, query o header. El UUID público puede incluirse en el bootstrap para reproducir una decisión visual; no contiene la MAC.

No se usa fingerprinting, IP, user-agent, PII ni el pseudónimo analítico. Si la cookie no puede clasificarse como almacenamiento funcional antes del consentimiento, se usa el valor por defecto hasta poder crearla.

Entrada canónica:

```text
proxus-ff:v1:<flag-key>:<allocation-version>:<subject-id>
```

Para que este framing sea inequívoco, `flag-key` se valida como segmentos ASCII lowercase separados por puntos (`registration.cta`) y `subject-id` como UUID v4, normalizado a lowercase. Las definiciones solo se obtienen mediante un constructor que valida y copia de forma inmutable sus variantes; el evaluador no acepta definiciones estructurales sin validar.

El algoritmo concreto se decide antes de implementar y fija UTF-8, bytes de salida, endianness y reducción al bucket `0..9_999`. No se usa `Math.random`, serialización de objetos ni conversión insegura de enteros mayores de 53 bits. Golden vectors compartidos prueban igualdad entre browser y Node, Unicode y límites de intervalos. No se añadirá rejection sampling salvo que la elección del hash muestre un sesgo relevante para el piloto.

Durante una revisión activa se congelan key, versión, unidad, algoritmo, población y pesos. Cambiarlos crea una revisión nueva; `allocationVersion` permite una reasignación deliberada.

## Decisión

El evaluador devuelve suficiente información para render y diagnóstico, sin imponer un modelo universal:

```ts
interface FeatureFlagDecision<A> {
  readonly key: string
  readonly value: A
  readonly allocationVersion: number
  readonly source: "allocation" | "default" | "dev-override"
}
```

El bucket puede permanecer como detalle del evaluador y de sus tests; se añadirá al resultado público solo si un consumidor real lo necesita. Ante subject o definición inválidos se devuelve el default seguro y se emite diagnóstico agregado en el seam servidor, nunca PII.

## Integración Atom-first

```text
bootstrap inicial + definición pública + override dev
                      ↓
            registrationCtaDecisionAtom
                      ↓
                    vista
```

La decisión es estado derivado. No se copia a `useState` ni se sincroniza con `useEffect`. La composition root proporciona el bootstrap y habilita overrides únicamente en desarrollo. Si el override necesita persistencia, el atom depende de un port de plataforma pequeño y `packages/frontend-web` implementa `localStorage`; si solo se necesita durante la sesión, un atom local evita crear ese seam.

No se diseñará SSR antes de que una app del piloto lo use. En las apps CSR actuales, un query atom obtiene el bootstrap same-origin antes de mostrar la superficie flaggeada y conserva loading/error/default explícitos. Si más adelante existe SSR, el snapshot verificado del servidor será la entrada inicial de hydration y no se reevaluará con otra identidad durante hydration.

Leer o evaluar un atom no registra una exposición. Un hook focalizado puede sincronizar visibilidad real con analytics porque el montaje/visibilidad es un sistema externo; debe limpiar recursos y tolerar React Strict Mode. Los clics despachan un mutation atom nombrado, no llaman al transporte desde el componente.

# Product analytics

## Módulo y seams

Analytics sí justifica un servicio: centraliza consentimiento, validación, envelope, admisión, buffering, retry y lifecycle. El repository es un seam real porque habrá un adapter de memoria para desarrollo/tests y BigQuery en producción.

```text
packages/shared/src/modules/product-analytics/
  events.ts               # unión cerrada de eventos públicos
  api.ts                  # HttpApi request/response
  errors.ts               # solo errores públicos accionables
  index.ts

apps/server/src/modules/product-analytics/
  model.ts                # envelope y batch internos
  service.ts              # Context.Service e interfaz
  service.live.ts         # política y worker scoped
  repository.ts           # port de escritura por batch
  handlers.ts             # adaptación HTTP
  adapters/
    repository.memory.ts
    repository.bigquery.ts
```

No se crea `mapping.ts`, config service, gateway adicional ni clase por evento de antemano. El mapping permanece privado en `service.live.ts` o en el adapter que lo necesite hasta que su complejidad justifique un módulo profundo.

## Flujo obligatorio

```text
HttpApi handler
  → ProductAnalytics service
    → ProductAnalyticsRepository port
      → memory o BigQuery adapter
```

El handler decodifica el contrato, recibe sesión/consentimiento/identidad verificados desde middleware, llama al servicio y transforma errores internos a respuestas públicas seguras. No construye filas, no encola y no llama al repository. El servicio aplica reglas de producto; el adapter encapsula SDK, credenciales y respuestas parciales de BigQuery.

Productores internos llaman al mismo servicio público del módulo, no al repository. No se crea un segundo port de productor hasta que exista otro proceso o transporte.

## Interfaces mínimas

Conceptualmente, con `Context.Service`, identificador global estable y métodos `Effect.fn`:

```ts
interface ProductAnalytics {
  readonly recordBatch: (
    events: ReadonlyArray<ProductAnalyticsEvent>,
    context: ProductAnalyticsContext,
  ) => Effect.Effect<ProductAnalyticsRecordResult, ProductAnalyticsError>
}

interface ProductAnalyticsRepository {
  readonly writeBatch: (
    batch: ReadonlyArray<ProductAnalyticsEnvelope>,
  ) => Effect.Effect<void, ProductAnalyticsRepositoryError>
}
```

`record` no se añade inicialmente: los productores de un evento llaman `recordBatch([event], context)`. Se añadirá solo si mejora de verdad la interfaz. `ProductAnalyticsContext` es un tipo interno creado con datos verificados por middleware o por un productor interno; no aparece en el schema HTTP.

El resultado distingue admisión de persistencia:

```ts
interface ProductAnalyticsRecordResult {
  readonly accepted: number
  readonly rejected: number
  readonly reason?: "no-consent" | "invalid" | "full" | "closed"
}
```

Para mantener una semántica simple, el primer endpoint acepta o rechaza el batch completo antes de encolarlo. No ofrece estados por elemento ni deduplicación de cliente hasta que un caso real requiera reintentos parciales. La respuesta documenta que `accepted` significa admitido en memoria, no persistido.

## Validación y envelope

El contrato shared es una unión cerrada y versionada de eventos con properties allowlisted y límites de tamaño. El servicio:

1. comprueba consentimiento verificado;
2. valida reglas temporales y de contexto que no pertenecen al wire schema;
3. deriva identidad/sesión confiable sin aceptar `userId`, permisos o variante autoritativa del body;
4. genera una sola vez `eventId`, `receivedAt` y el envelope interno;
5. ofrece el batch completo a la cola.

`occurredAt` cliente, si se admite, queda acotado y separado de `receivedAt`. No se implementa deduplicación durable en este slice. Si se añade `clientEventId`, será opcional y solo reducirá duplicados best effort; nunca implicará exactly-once.

El endpoint same-origin limita cantidad de eventos y tamaño, exige método/content type definidos y aplica la política CSRF/Origin/Fetch Metadata del servidor. Telemetría pública puede falsificarse y nunca alimenta autorización, facturación, fraude ni invariantes.

## Buffering y lifecycle Effect

`ProductAnalyticsLive` es una Layer scoped que adquiere sus dependencias una vez y cierra sobre ellas. Su implementación usa una `Queue` acotada y un único worker iniciado con `Effect.forkScoped`. La lógica exacta de agrupación se elegirá contra la API de Effect v4 instalada; no se fija aquí una cadena `Stream` especulativa.

Política inicial:

- admisión atómica por batch, sin espera cuando la cola está llena;
- un consumidor agrupa hasta `batchSize` o `flushInterval`;
- `writeBatch` usa retry finito con backoff exponencial, jitter y predicado `retryable`;
- los IDs se conservan entre intentos;
- un fallo permanente o retries agotados descarta de forma observable;
- caída abrupta puede perder lo aceptado en memoria;
- analytics nunca rompe el flujo principal del producto.

Configuración de capacidad, batch, intervalo y retry pertenece al módulo consumidor y se valida durante construcción de la Layer. Se usan `Config`/schemas tipados; no se lee `process.env` dentro de operaciones. Los defaults solo existen cuando expresan una política deliberada.

El Scope es el owner del worker y del cliente BigQuery. La adquisición y liberación del cliente se acoplan con `Effect.acquireRelease` en el adapter. El módulo no instala señales ni llama `runPromise`; `ServerLayers.ts` compone una sola instancia y el runtime cierra el Scope. El finalizer deja de admitir, intenta drenar hasta un límite y reporta solo conteos. No se promete un protocolo perfecto entre cierre HTTP y cierre de Layer hasta que la infraestructura del servidor exponga ese seam explícitamente.

Si un evento no puede perderse, se diseña una outbox durable separada; no se endurece esta cola hasta fingir durabilidad.

## Adapters

### Memory

Mantiene un historial acotado, scoped y reiniciable por test. No escribe JSONL ni imprime payloads. Sirve para desarrollo, contract tests del repository y tests del servicio; no es fallback productivo.

### BigQuery

El adapter:

- adquiere un único cliente scoped;
- valida proyecto, dataset y tabla al construir su Layer;
- traduce fallos del SDK a errores internos clasificados y seguros;
- inserta batches con `eventId` como `insertId` estable;
- conserva IDs al reintentar filas retryable y reporta conteos de fallos permanentes;
- no crea infraestructura en requests.

BigQuery e `insertId` no garantizan exactly-once. La tabla raw conserva `eventId` y timestamps suficientes para deduplicación posterior. La vista curada, `MERGE`, políticas de startup degradado y comprobaciones remotas exhaustivas se difieren hasta definir la operación productiva; el primer modo productivo falla startup ante configuración local ausente o inválida y nunca cae silenciosamente a memoria.

La composition root selecciona explícitamente:

```text
development/test → ProductAnalyticsLive → RepositoryMemory
production       → ProductAnalyticsLive → RepositoryBigQuery
```

# Flags y analytics

El piloto registra tres eventos concretos:

- `feature_flag_exposed` cuando el CTA es realmente visible;
- `registration_cta_clicked` desde el mutation/event atom del click;
- un outcome de servidor estable, si existe antes de activar el experimento.

La exposición cliente incluye key, versión y variante reportada. En ingestión, el backend verifica la cookie y recalcula la decisión para flags públicas; almacena por separado variante reportada y verificada. Una discrepancia o identidad inválida se excluye del análisis causal primario y aumenta una métrica agregada. Fallar analytics nunca cambia la variante ni el resultado del producto.

No se añade `experiment_converted`. Outcomes siguen siendo eventos de producto. La deduplicación cliente de exposiciones solo reduce remounts/Strict Mode y no promete unicidad global.

Para afirmar resultados causales hacen falta asignación/elegibilidad reconstruibles, no solo exposiciones best effort. Si el piloto no dispone de esa fuente, se etiqueta explícitamente como validación de instrumentación y no como experimento ITT. Antes de activar un experimento causal se preespecifican población, unidad, métrica primaria, ventana, denominador, guardrails, tamaño/horizonte y regla de parada; se revisan SRM, pérdida diferencial, identidad inestable y duplicados.

# Privacidad y observabilidad

- Analytics empieza desactivado hasta aprobar finalidad, consentimiento/base legal, retención y procedimiento de derechos.
- Antes de opt-in no crea identidad analítica, no encola y no guarda backlog. Errores al resolver consentimiento fallan cerrados.
- El pseudónimo analítico es distinto del subject de flags y del ID de cuenta. Cualquier asociación autenticada se deriva en backend mediante una política aprobada.
- No se permiten texto libre, URLs/query strings, email, nombre, IP persistida, user-agent completo, tokens, stacks ni contenido de usuario.
- Logs, spans y métricas usan nombres estables y conteos/buckets acotados; nunca payloads, cookies, pseudónimos ni IDs como labels.
- Se observan por separado aceptados, rechazados por motivo, profundidad/saturación, batches persistidos, filas fallidas, retries y pérdidas en shutdown.
- La retirada de consentimiento cesa ingestión y elimina/rota la identidad analítica local sin alterar la cookie funcional de flags.
- Retención, ubicación, acceso y borrado de BigQuery deben aprobarse antes de producción; no se fijan cifras arbitrarias en esta propuesta.

# Plan incremental

1. **Flags puras:** definición del CTA, evaluador y golden vectors.
2. **Frontend:** bootstrap CSR, decision atom, override dev mínimo y CTA; sin SSR si la app no lo usa.
3. **Contrato analytics:** tres eventos cerrados, endpoint batch y consentimiento desactivado por defecto.
4. **Servicio:** validación/envelope, queue acotada, worker scoped y repository memory.
5. **Integración piloto:** exposición visible, click y outcome servidor disponible.
6. **Producción:** adapter BigQuery, configuración estricta, privacidad y operación aprobadas.

Cada paso debe dejar una capacidad comprobable. BigQuery no bloquea probar evaluación, atoms o ingestión memory; activar analytics sí queda bloqueado por privacidad y por un outcome/metodología honestos.

# Tests

- Evaluador puro: invariantes de definiciones, golden vectors y defaults.
- Atoms con `AtomRegistry`: bootstrap loading/error/success, derivación, override dev y aislamiento; componentes solo render e interacción accesible.
- Servicio real con repository memory fresco: consentimiento, validación, admisión atómica, overflow, retry clasificado, cierre e interrupción usando reloj virtual.
- Contract tests del repository contra memory y BigQuery donde deban coincidir; casos específicos del SDK permanecen en el adapter.
- Handler con servicio sustituido en su interfaz: decode, contexto verificado, límites, errores/status y cuerpos seguros.
- E2E pequeño con cliente tipado y app in-process: ingestión aceptada/rechazada sin abrir TCP.
- Instrumentación focalizada: atributos permitidos y ausencia de payloads/PII.

No se prueba el servicio mediante sus internals de Queue/Ref ni se duplica la lógica del evaluador en tests de UI/HTTP. Layers con estado son frescas por test y los tests temporales no exportan telemetría.

# Validación prevista

```bash
pnpm effect:diagnostics
pnpm --filter @proxus/shared test
pnpm --filter @proxus/shared typecheck
pnpm --filter @proxus/frontend-core test
pnpm --filter @proxus/frontend-core typecheck
pnpm --filter @proxus/frontend-web test
pnpm --filter @proxus/frontend-web typecheck
pnpm --filter @proxus/server test
pnpm --filter @proxus/server typecheck
pnpm --filter @proxus/web test
pnpm --filter @proxus/web typecheck
```

Antes de ejecutar se comprobarán los scripts reales. No se presentarán `boundaries`, lint ni tests de browser como ejecutados si el workspace no los ofrece.

# Decisiones abiertas antes de implementar

1. Algoritmo de hash v1 y golden vectors.
2. Clasificación y retención de la cookie funcional de flags.
3. Contrato aprobado de consentimiento y retención analytics.
4. Valores medidos de capacidad, batch, flush, timeout y retry.
5. Evento outcome del piloto y si existe una fuente válida de asignación/elegibilidad.
6. Requisitos operativos mínimos de BigQuery (tabla, permisos, readiness y borrado).

## Decisión implementada: distribución frontend-only por snapshots (2026-07-16)

La identidad de instalación se genera en el navegador y se conserva mediante el
port `FeatureFlagInstallationIdentity`; el adapter web es el único módulo que
conoce `localStorage` y Web Crypto. El backend no emite cookie, no conoce esa
identidad y no recalcula variantes. Las flags siguen sin ser autoridad.

PostgreSQL/PGlite guarda revisiones inmutables con la configuración pública
completa. Un índice parcial garantiza una sola revisión activa y el cambio de
revisión se realiza como una activación atómica, nunca por actualización parcial
de flags. Ausencia de fila activa produce el snapshot vacío de revisión `0`.
`GET /feature-flags/snapshot` distribuye el snapshot completo con ETag derivado de
la revisión y cache pública revalidable. La publicación operativa valida un JSON
completo y ejecuta `pnpm --filter @proxus/backend-infra db:publish-feature-flags
<snapshot.json>` con `DATABASE_URL`; inserción y activación ocurren en una única
transacción serializada. Un trigger impide modificar configuración, revisión o
fecha de revisiones existentes. El rango persistido queda limitado al rango entero
sin pérdida del wire (`0..Number.MAX_SAFE_INTEGER`) y el adapter lee `bigint` antes
de convertirlo.

Frontend-core conserva loading/error/success en el query atom y deriva decisiones
sin copiar estado a React. Una key ausente usa su definición local. Si el snapshot
contiene una variante desconocida para el bundle, o una configuración inválida,
la decisión usa el fallback local seguro en vez de intentar renderizarla. Los
eventos de exposición/click incluyen `configurationRevision`; analytics acepta el
reporte como telemetría no autoritativa y ya no intenta verificarlo en backend.

## Nota de implementación product analytics (2026-07-16)

La composición productiva usa BigQuery de forma estricta y falla al arrancar si faltan
`PRODUCT_ANALYTICS_BIGQUERY_PROJECT`, `PRODUCT_ANALYTICS_BIGQUERY_DATASET` o
`PRODUCT_ANALYTICS_BIGQUERY_TABLE`; no existe fallback a memoria. La dependencia
`@google-cloud/bigquery` está fijada y cada fila usa el `eventId` estable como `insertId`,
sin prometer exactly-once.

La activación productiva permanece **bloqueada**: todavía no existe middleware aprobado
que resuelva consentimiento e identidad analítica ni están aprobadas retención, ubicación,
acceso y borrado. Por ello la composition root productiva instala deliberadamente un
contexto fail-closed (`consent: unknown`) y rechaza toda ingestión como `no-consent`, aunque
el adapter BigQuery esté configurado. Desarrollo permite opt-in únicamente mediante el
header explícitamente dev `x-proxus-dev-analytics-consent: granted` y evidencia browser
same-origin (`Origin`/`Host` coincidentes y `Sec-Fetch-Site: same-origin`). El contrato
HTTP excluye `registration_completed`: solo un productor server-side puede emitirlo.
Las exposiciones sin una decisión recalculada desde identidad/configuración confiable se
rechazan, igual que timestamps fuera del skew configurado.

El cierre serializa el cambio a estado cerrado con la admisión. Una interrupción espera
la escritura in-flight; el timeout se aplica al backlog restante, por lo que nunca se
presenta como garantía de entrega. Los fallos parciales de BigQuery se correlacionan por
`insertId`: solo se reintentan las filas fallidas con motivos transitorios. Memoria no
evicta filas silenciosamente. El SDK Node de
BigQuery no expone una operación de cierre; el cliente se construye una vez por Layer,
pero no se finge un finalizer inexistente.

## Decisión implementada: invalidación realtime SSE (2026-07-18)

La publicación de un snapshot persiste primero y luego emite
`FeatureFlagSnapshotPublished` al catálogo modular `BackendAppEvent`. El
`AppEventBus` ejecuta un registry estático de reactions tipadas con aislamiento
de errores. Catálogo y dispatcher son conceptos distintos: el primero es una
unión de tipos; el segundo ejecuta las reactions locales coincidentes con
concurrencia acotada y no promete transacción, replay, durabilidad ni entrega
entre procesos.

La única reaction inicial transforma el evento interno en
`FeatureFlagSnapshotChanged { revision }` y lo publica en un PubSub realtime
scoped, acotado y sliding. SSE no expone el snapshot ni el evento backend.
`GET /realtime/events` se declara schema-first con
`HttpApiSchema.StreamSse`, añade heartbeat y mantiene semántica de invalidación:
el cliente obtiene el snapshot al arrancar/reconectar y vuelve a obtenerlo al
recibir una revisión o detectar un hueco. No se implementan outbox ni replay
durable. Product analytics permanece fuera del registry porque no existe aún un
evento backend analítico real que justifique esa reaction.
