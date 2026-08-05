# Feature flags y product analytics

> Estado: arquitectura implementada para el primer vertical A/B (2026-07-18)

## Modelo

No existe `Experiment` ni lifecycle experimental. Una revisión inmutable distribuye flags `enabled`/`disabled`; cada bundle mantiene la unión cerrada de variantes que sabe renderizar. El primer flag es `registration.landing`, variantes `short` y `long`. Deshabilitado, ausente, inválido o desconocido usa `short` de forma segura. El narrowing de variantes remotas se realiza contra esa unión local antes de construir la definición evaluable; no se fuerza mediante casts ni se ocultan snapshots inválidos con excepciones defensivas.

La decisión se obtiene con el flujo `view → atom → FeatureFlagDistribution → adapter web → snapshot HTTP`. Web usa la base same-origin `/api`, tanto para `GET /api/feature-flags/snapshot` como para `POST /api/product-analytics/events`; en desarrollo Vite retira ese prefijo sin sustituir origin ni host (`changeOrigin: false`). `makeFeatureFlagSnapshotModule` concentra la única lectura del snapshot y devuelve `snapshotAtom` más `lifecycleAtom`. `App` monta el lifecycle en su raíz, separado de la exposición de landing; hace una lectura inicial y polling pull-based con el `Clock` de Effect y el `AtomRegistry` activo. El intervalo configurable usa cinco minutos por defecto para coincidir con `max-age=300`, y cerrar el scope al desmontar cancela el polling sin browser globals ni SSE. Durante la revalidación el último `Success` sigue disponible con `waiting: true`; un fallo posterior es `Failure` con `previousSuccess`. El assignment conserva esos estados `AsyncResult`. El adapter web conserva una identidad anónima UUID v4 por instalación y marca exposiciones ya vistas por `(subject, flagKey, revision)`. Si `localStorage` rechaza lecturas o escrituras, la identidad permanece estable en memoria mientras viva la instancia del adapter, aunque no pueda persistirse para la siguiente carga. Sin consentimiento, o si el almacenamiento de consentimiento/deduplicación no es accesible, la UI se asigna igualmente y analytics falla cerrado sin realizar peticiones.

## Identidad y transición a principal

Hoy no hay autenticación pública y no se inventa una. `ProductAnalyticsHttpContext` es el seam de transporte para consentimiento e identidad verificadas; producción falla cerrada. Desarrollo permite exclusivamente same-origin, consentimiento explícito y un subject UUID enviado en un header marcado como desarrollo.

Cuando exista auth, el adapter de ese seam resolverá un principal estable del servidor. La política de transición debe:

1. buscar decisiones ya vistas de la instalación y preservarlas para la revisión activa;
2. vincularlas al principal mediante almacenamiento server-side, sin reasignar la UI montada;
3. usar el principal como unidad en dispositivos/plataformas posteriores, de modo que una flag común produzca la misma variante;
4. no aceptar account IDs ni subjects autoritativos en el body analytics.

Hasta entonces solo se garantiza estabilidad por instalación; no se afirma identidad cross-device.

## Analytics

Los eventos cerrados son `feature_flag_exposed`, `registration_started`, `registration_step_viewed`, `registration_step_completed` y `registration_completed`. Los eventos de paso incluyen `step`, `stepIndex`, `totalSteps` y `provider`; la UI emite `viewed` al presentar un paso y `completed` únicamente al avanzar a un índice posterior. `registration_completed` significa únicamente que la UI del navegador alcanzó el último paso; no es un outcome autoritativo de backend. Cada envelope segmentable materializa de forma inmutable `flagKey`, `variant`, `revision` y `subjectId`. Consentimiento e identidad son contexto de transporte, no propiedades confiadas al evento. La revisión `0` corresponde al snapshot remoto sintético vacío y solo admite el default local `short`, sin volver a calcular un hash. Las revisiones publicadas son telemetría reportada por el cliente hasta incorporar una historia verificable de snapshots.

La exposición es opcional y ocurre solo mientras la landing de registro con path vacío está visible; no se monta desde `App`. El atom de producto y el adapter reducen duplicados por `(subject, flag, revision)`, por lo que el ciclo setup-cleanup-setup de Strict Mode no emite una segunda exposición. Una revisión nueva sí puede emitir otra exposición para el mismo subject. El assignment visible se conserva antes de lanzar analytics y las entregas se ejecutan concurrentemente dentro del scope: un POST anterior bloqueado no retrasa una revisión visible posterior ni su atribución. Inicio se emite en la primera selección y finalización al elegir la asignatura, siempre después de que el reemplazo del path haya tenido éxito. Esos comandos reciben `void` y leen el assignment actual dentro del atom; React no captura ni reenvía snapshots que puedan quedar obsoletos. Los valores persistidos se decodifican y los batches HTTP se decodifican/codifican con sus contratos `Schema`. La cola y persistencia continúan siendo best-effort y nunca cambian el registro.

Un evento de negocio backend debe permanecer libre de campos analíticos. Si aparece un caso de uso backend real de finalización, su integración analítica deberá diseñarse con identidad verificada y una entrega adecuada a los procesos implicados. No se anticipa un bus, evento o reaction mientras el registro siga siendo exclusivamente cliente.

## Operación

Un snapshot del piloto tiene esta forma:

```json
{
  "configurationRevision": 1,
  "flags": [{
    "key": "registration.landing",
    "enabled": true,
    "allocationVersion": 1,
    "default": "short",
    "variants": [{ "value": "short", "weight": 5000 }, { "value": "long", "weight": 5000 }]
  }]
}
```

No se deben interpretar estos datos como autorización ni como evidencia de causalidad por sí solos. El cierre de analytics deja de admitir, interrumpe el worker y drena trabajo en vuelo/pendiente dentro de un único `shutdownTimeout`; repository bloqueado y backoff de retries también consumen ese presupuesto. El adapter BigQuery desactiva los retries parciales internos del SDK (`partialRetries: 0`) y el servicio solo reintenta índices únicos, acotados y contenidos en el conjunto de filas fallidas. Antes de decodificar batches, el composition root público aplica el límite raw común de 256 KiB y responde 413 si se excede.

En desarrollo, el repository de analytics persiste en una tabla append-only de
la misma PGlite configurada por `PGLITE_DATA_DIR`; no se pierde al reiniciar el
servidor. El adapter de memoria queda reservado a tests y composiciones
explícitas. `event_id` es la clave idempotente de reintento y el payload se
guarda codificado con el Schema público. Esta telemetría sigue sin ser auditoría.

La publicación operativa corre en un proceso separado y activa cada revisión en
PostgreSQL. La revisión `0` queda reservada al snapshot sintético vacío; el Schema
de publicación y el constraint SQL exigen revisiones persistidas `>= 1`. La
migración de este límite reubica una rev0 preexistente en la siguiente revisión
positiva libre, normaliza cada objeto JSON legacy `{configurationRevision,
flags}` a su array `flags` y deja intactas las configuraciones que ya son arrays;
retira y restaura el trigger inmutable dentro de la migración para que la
excepción de upgrade no debilite la política posterior. El publisher productivo
comprueba primero que no haya migraciones pendientes. Los
servidores públicos leen esa misma persistencia y los clientes revalidan el
snapshot mediante HTTP conditional GET. No existe un canal push in-process
porque no observaría al publisher real. Tampoco existe publisher PGlite entre
procesos: PGlite no se comparte concurrentemente mediante `PGLITE_DATA_DIR`; el
desarrollo que necesite publisher y servidor simultáneos usa PostgreSQL local.
