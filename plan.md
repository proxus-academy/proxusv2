# Plan — Plataforma de gestión UGC

## Objetivo

Construir una aplicación dedicada para gestionar el ciclo completo de los creadores UGC:

1. Captación inbound y outbound.
2. Registro y validación.
3. Onboarding y reuniones.
4. Periodo de prueba.
5. Asignación a campañas y grupos.
6. Entrega y seguimiento de vídeos.
7. Cierre y revisión de campañas.
8. Generación y liquidación de pagos.

El diseño debe ser pequeño, robusto y testeable. Las entidades con ciclo de vida se modelarán como máquinas de estados finitos y solo podrán cambiar mediante acciones semánticas de dominio.

## Decisiones principales

- Usar ugc_users como agregado principal del journey del creador.
- No crear ugc_applications, ugc_trials, ugc_submissions ni ugc_jobs en el MVP. La relación histórica creador–campaña sí necesita `ugc_group_members`, porque cada participación debe pasar obligatoriamente por un grupo y puede haber una asignación futura además de la actual.
- Persistir estados gruesos y derivar los subestados temporales usando las fechas y entidades relacionadas.
- Guardar la información variable de cada estado en data JSONB.
- Validar status + data como una unión discriminada versionada mediante Effect Schema.
- Mantener como columnas normales las relaciones, versiones y campos que requieren claves foráneas, unicidad o consultas frecuentes.
- Permitir varias asignaciones históricas y una campaña futura, pero rechazar ventanas activas solapadas.
- No crear `ugc_events` en este MVP: el sistema de eventos está pendiente en otra PR. Se conservan restricciones únicas y concurrencia optimista donde corresponde.
- No exponer operaciones genéricas como SetStatus o PatchData.

## Límite del módulo

Nombre propuesto del bounded context: ugc-management.

    HTTP handler
      → service/use case
      → repository port
      → adapter Drizzle

Capas afectadas:

- Contratos compartidos y API: sí.
- Persistencia y repositories: sí.
- Services y casos de uso: sí.
- Handlers HTTP: sí.
- Frontend core y atoms: sí.
- UI, pantallas y rutas: sí.
- Tests y fixtures: sí.
- Documentación: sí.

## Tablas del MVP

    ugc_users
    ugc_campaigns
    ugc_groups
    ugc_group_members
    ugc_meets
    ugc_videos
    ugc_video_data
    ugc_payments

## 1. ugc_users

Representa el journey actual del creador desde que es un lead hasta que abandona la plataforma.

### Columnas

    id                    uuid primary key
    auth_user_id          uuid null, unique
    user_type             creator | manager
    status                ugc_user_status
    display_name          text
    email                 text unique
    country_code          char(2)
    data                  jsonb
    data_version          integer
    version               integer
    created_at            timestamptz
    updated_at            timestamptz

auth_user_id es nulo para un lead outbound que todavía no se ha registrado. Al registrarse, se enlaza el usuario real sin crear otro ugc_user.

La campaña no se guarda directamente en `ugc_users`. Se deriva de `ugc_group_members → ugc_groups → ugc_campaigns`, lo que impide representar una participación sin grupo y conserva el histórico.

### Estados persistidos

    lead
    applicant
    onboarding
    trial
    creator
    suspended
    rejected
    disqualified
    exited

- lead: contacto outbound aún no registrado.
- applicant: persona registrada pendiente de aceptación.
- onboarding: candidatura aceptada, completando requisitos y reunión.
- trial: periodo de prueba en curso o pendiente de evaluación.
- creator: creador aprobado, con o sin campaña actual.
- suspended: acceso operativo detenido temporalmente.
- rejected: candidatura no aceptada.
- disqualified: proceso terminado por incumplimiento, como dos ausencias.
- exited: relación con la plataforma finalizada.

### Estados efectivos derivados

No se persisten. Una función pura los calcula con un reloj inyectado.

    onboarding
      requirements_pending
      meeting_pending
      meeting_scheduled
      follow_up_required

    trial
      preparation
      warming_up
      publishing
      awaiting_evaluation

    creator
      waiting_campaign
      campaign_scheduled
      campaign_active
      campaign_reconciliation

Ejemplos:

- trial y now anterior a publishingStartsAt: warming_up.
- trial y now dentro de la ventana: publishing.
- trial y now posterior a publishingEndsAt: awaiting_evaluation.
- creator sin membresía vigente o futura: waiting_campaign.
- El subestado de un creator con campaña se deriva de las fechas y estado de esa campaña.

### Data tipado por status

La fuente de verdad en código será una unión discriminada equivalente a:

    LeadState          = { status: "lead", dataVersion: 1, data: LeadData }
    ApplicantState     = { status: "applicant", dataVersion: 1, data: ApplicantData }
    OnboardingState    = { status: "onboarding", dataVersion: 1, data: OnboardingData }
    TrialState         = { status: "trial", dataVersion: 1, data: TrialData }
    CreatorState       = { status: "creator", dataVersion: 1, data: CreatorData }
    SuspendedState     = { status: "suspended", dataVersion: 1, data: SuspendedData }
    RejectedState      = { status: "rejected", dataVersion: 1, data: RejectedData }
    DisqualifiedState  = { status: "disqualified", dataVersion: 1, data: DisqualifiedData }
    ExitedState        = { status: "exited", dataVersion: 1, data: ExitedData }

Información orientativa:

    LeadData
      source = outbound
      contact
      countryCode
      createdByManagerId
      notes

    ApplicantData
      source = inbound | outbound
      profile
      contact
      countryCode
      appliedAt

    OnboardingData
      acceptedAt
      acceptedBy
      requirements
      missedMeetCount

    TrialData
      startedAt
      publishingStartsAt
      publishingEndsAt
      requiredVideoCount
      requirements
      rulesSnapshot

    CreatorData
      approvedAt
      tier
      profile

    TerminalData
      reason
      decidedAt
      decidedBy
      previousStateSnapshot, solo cuando sea necesario reanudar

Los datos que deben sobrevivir a todos los estados pueden vivir en una sección común del JSON. Las transiciones construyen el siguiente documento completo; no aplican parches opacos.

### Managers

Manager es un `user_type` de `ugc_users`, con estado `active | disabled` y `ManagerData` tipado.

- `auth_user_id` enlaza la identidad común de Proxus.
- `ManagerData` conserva mercados, disponibilidad para reuniones y notas operativas.
- La superficie de manager solo se muestra si la sesión resuelve un `ugc_user` manager activo.
- Un grupo referencia ese perfil UGC de manager; administración sigue usando el rol global existente.

## 2. campaigns

Representa una campaña, sus reglas, ámbito geográfico, ventanas temporales y configuración económica.

### Columnas

    id                       uuid primary key
    status                   campaign_status
    starts_at                timestamptz
    submissions_close_at     timestamptz
    reconciliation_ends_at   timestamptz
    data                     jsonb
    data_version             integer
    version                  integer
    created_at               timestamptz
    updated_at               timestamptz

### Estados persistidos

    draft
    published
    finalized
    cancelled
    archived

### Estados efectivos derivados

Para una campaña published:

    now < starts_at
      scheduled

    starts_at <= now < submissions_close_at
      active

    submissions_close_at <= now < reconciliation_ends_at
      reconciliation

    now >= reconciliation_ends_at
      ready_to_finalize

finalized sí es una acción explícita: congela resultados y genera pagos, por lo que no puede depender únicamente del reloj.

### CampaignData

    name
    description
    market
    eligibleCountryCodes
    timezone
    objectives
    formats
    tiers
    baseCompensation
    bonusRules
    videoRules
    rulesVersion

Las reglas económicas y de validación se congelan por versión o snapshot. Cambiar una campaña no puede alterar retroactivamente vídeos o pagos ya cerrados.

## 3. ugc_groups

Representa un grupo operativo dentro de una campaña.

### Columnas

    id                uuid primary key
    campaign_id       uuid → campaigns.id
    manager_user_id   uuid → users.id
    status            group_status
    capacity          integer null
    data              jsonb
    version           integer
    created_at        timestamptz
    updated_at        timestamptz

### Estados

    draft
    active
    completed
    cancelled

Reglas del MVP:

- Cada grupo pertenece a una campaña.
- Cada grupo tiene un manager responsable.
- Un manager puede tener varios grupos.
- Cada participación de un creador se guarda en `ugc_group_members` y siempre referencia un grupo.
- Puede haber una campaña futura mientras la actual no solape su ventana de publicación.
- No se puede superar la capacidad del grupo.
- Creador, campaña, grupo y manager deben ser compatibles por mercado.

La coherencia grupo-campaña se refuerza con claves foráneas, unicidad creador–grupo y la política de no solapamiento del service.

Importar grupos de una campaña anterior copia su configuración, no sus miembros implícitamente. Cada reasignación se valida contra la campaña nueva.

Si un grupo necesita varios managers en el futuro, se añadirá una tabla de relación. No se almacenará un array de IDs en JSON.

## 4. meets

Cada fila representa un intento real de reunión de onboarding.

### Columnas

    id                 uuid primary key
    ugc_user_id        uuid → ugc_users.id
    manager_user_id    uuid → users.id
    status             meet_status
    scheduled_at       timestamptz
    completed_at       timestamptz null
    data               jsonb
    version            integer
    created_at         timestamptz
    updated_at         timestamptz

### Estados

    scheduled
    attended
    missed
    cancelled

### Reglas

- Solo un usuario en onboarding con requisitos previos completos puede reservar.
- El manager debe estar habilitado para el mercado del creador.
- Debe comprobarse la disponibilidad antes de reservar.
- La primera ausencia devuelve al usuario a meeting_pending.
- La segunda ausencia ejecuta DisqualifyApplicant.
- Una reunión atendida no aprueba automáticamente el onboarding; el manager registra el resultado.

## 5. videos

Representa una entrega de vídeo durante una prueba o una campaña.

### Columnas

    id              uuid primary key
    ugc_user_id     uuid → ugc_users.id
    campaign_id     uuid null → campaigns.id
    context         video_context
    status          video_status
    published_at    timestamptz null
    data            jsonb
    data_version    integer
    version         integer
    created_at      timestamptz
    updated_at      timestamptz

### Contextos

    trial
    campaign

Un vídeo de prueba no necesita campaña. Un vídeo de campaña sí.

### Estados

    submitted
    accepted
    rejected
    locked

locked significa que ya forma parte de un cierre y no puede editarse.

### VideoData

    formatId
    primaryUrl
    secondaryUrl
    platformIdentifiers
    validation
    rejectionReason
    rulesSnapshot

### Reglas

- Solo el propietario puede registrar sus vídeos, salvo una acción administrativa explícita.
- Un vídeo de prueba solo se sube durante la ventana de publicación del trial.
- Un vídeo de campaña solo se sube mientras la campaña acepta entregas.
- El creador debe estar asignado a esa campaña.
- Los identificadores externos deben ser únicos cuando la plataforma lo garantice.
- Tras cerrar las entregas no se pueden añadir ni modificar vídeos.
- La validación final usa el snapshot de reglas asociado al vídeo.

## 6. video_data

Serie histórica append-only de métricas observadas para un vídeo.

### Columnas

    id             uuid primary key
    video_id       uuid → videos.id
    captured_at    timestamptz
    source         text
    data           jsonb
    created_at     timestamptz

data puede contener views, likes, comments, shares, followers y, si hace falta, el payload original del proveedor.

Reglas:

- No se actualizan capturas anteriores.
- Una restricción como unique(video_id, source, captured_at) hace idempotente la ingesta.
- Los bonos indican qué captura o ventana se utilizó.

## 7. payments

Representa una obligación de pago ya calculada y congelada.

### Columnas

    id                uuid primary key
    ugc_user_id       uuid → ugc_users.id
    campaign_id       uuid → campaigns.id
    status            payment_status
    amount_minor      bigint
    currency          char(3)
    data              jsonb
    version           integer
    created_at        timestamptz
    updated_at        timestamptz
    paid_at           timestamptz null

### Estados

    pending
    paid
    cancelled

### PaymentData

    baseAmount
    videoAmounts
    bonuses
    adjustments
    calculationVersion
    calculationInputs
    externalPaymentReference
    cancelReason

### Reglas

- Finalizar una campaña genera como máximo un pago por creador y campaña en el MVP.
- La generación es idempotente.
- El importe usa unidades menores, nunca coma flotante.
- El desglose y los inputs del cálculo quedan congelados.
- Exportar CSV no cambia el estado.
- Marcar como pagado requiere referencia, actor y fecha.
- Un pago pagado no vuelve a pending ni se recalcula.
- Las correcciones se modelan como ajustes explícitos, no sobrescribiendo el histórico.

## 8. Eventos de dominio, fuera del MVP

No se crea `ugc_events` en esta entrega. Las acciones ya son comandos semánticos y el módulo queda preparado para publicar eventos cuando se integre la PR del sistema de eventos, sin acoplar ahora una tabla provisional.

## Relación usuario-campaña

En el MVP vive en:

    ugc_group_members.group_id
      → ugc_groups.campaign_id

Invariante necesaria:

> Un creador nunca participa en una campaña sin grupo y sus ventanas activas no pueden solaparse.

El histórico se obtiene directamente de las membresías, vídeos y pagos. No se guardan arrays de campañas en `ugc_users.data`.

## Tipado en código y restricciones en base de datos

### En código

Effect Schema es la fuente de verdad para status + dataVersion + data.

- Cada lectura del repositorio decodifica el registro.
- Cada escritura valida el estado completo antes de persistir.
- Un registro imposible produce InvalidRepositoryState.
- data_version permite migrar documentos antiguos.
- El frontend consume contratos derivados de los mismos schemas compartidos.

### En PostgreSQL

La base de datos protege invariantes estructurales y concurrentes:

- Enums o checks para estados.
- data debe ser un objeto JSON.
- Versiones positivas.
- Claves foráneas y unicidad.
- Coherencia entre grupo y campaña.
- Importes y capacidades válidos.
- Fechas ordenadas.
- Compare-and-swap mediante version.

No se duplicará en SQL toda la unión discriminada de Effect Schema, porque produciría dos fuentes de verdad.

### Cuándo usar columna o JSON

Usar columna si el dato:

- Participa en una clave foránea.
- Necesita unicidad.
- Forma parte habitual de filtros, orden o joins.
- Interviene en una invariante concurrente.
- Debe actualizarse sin reescribir un documento completo.

Usar data JSONB si:

- Varía según el estado.
- Es configuración flexible.
- Se lee normalmente junto al agregado.
- No necesita integridad referencial propia.

Los índices de expresiones JSON o GIN se añadirán cuando existan consultas reales que los justifiquen.

## Acciones de dominio

### ugc_user

    CreateOutboundLead
    RegisterInboundApplicant
    RegisterOutboundLead
    AcceptApplicant
    RejectApplicant
    CompleteOnboardingRequirement
    ScheduleOnboardingMeet
    RecordMeetAttendance
    ApproveOnboarding
    StartTrial
    CompleteTrialRequirement
    SubmitTrialVideo
    PassTrial
    FailTrial
    AssignToCampaign
    MoveToGroup
    RemoveFromCampaign
    ChangeCreatorTier
    SuspendCreator
    ResumeCreator
    ExitCreator

### campaign

    CreateCampaign
    UpdateDraftCampaign
    PublishCampaign
    CreateCampaignGroups
    ImportGroupConfiguration
    CloseSubmissionsEarly
    FinalizeCampaign
    CancelCampaign
    ArchiveCampaign

### video

    SubmitVideo
    UpdateSubmittedVideo
    AcceptVideo
    RejectVideo
    LockVideo
    CaptureVideoMetrics

### payment

    GenerateCampaignPayments
    ExportPendingPayments
    MarkPaymentPaid
    CancelPayment

Cada acción declara:

- Actor permitido.
- Estado de origen.
- Input.
- Precondiciones.
- Nuevo estado.
- Entidades relacionadas afectadas.
- Evento generado.
- Errores de dominio posibles.

## Implementación de las FSM

La lógica central será pura:

    deriveEffectiveState(persistedState, relatedState, now)
      → effectiveState

    decide(persistedState, command, context, now)
      → nextState + escrituras relacionadas

Principios:

- decide no accede a base de datos, red ni reloj global.
- El tiempo entra como dependencia.
- Las transiciones imposibles devuelven errores de dominio tipados.
- El service carga el agregado y sus referencias.
- El service invoca la decisión pura.
- El repository persiste los cambios relacionados respetando sus restricciones.
- La escritura usa id y version esperada.
- Si ninguna fila cambia, se devuelve un conflicto de concurrencia.

## Acciones que afectan varias entidades

### RegisterOutboundLead

    ugc_user
      enlaza auth_user_id
      lead → applicant


### ScheduleOnboardingMeet

    ugc_user
      permanece onboarding

    meet
      crea un intento scheduled


### RecordMeetAttendance = missed

    meet
      scheduled → missed

    ugc_user
      primera ausencia → onboarding / meeting_pending
      segunda ausencia → disqualified

### PassTrial

    ugc_user
      trial → creator
      queda waiting_campaign

    videos
      se conservan como histórico de prueba

### AssignToCampaign

    ugc_group_member
      enlaza creador y grupo con tier y estado de participación

    campaign
      debe estar published y admitir asignaciones

    ugc_group
      debe pertenecer a la campaña, tener capacidad y ser compatible

### FinalizeCampaign

    campaign
      ready_to_finalize → finalized

    videos
      se bloquean los incluidos en el cierre

    ugc_group_members
      se marcan completed; el creador permanece creator / waiting_campaign

    payments
      administración los genera después del cierre, de forma idempotente y con desglose congelado

## Filtros y elegibilidad

La elegibilidad será una política de dominio reutilizada para listar opciones y ejecutar asignaciones. Ocultar algo en la UI no sustituye la validación backend.

### Datos mínimos

Del creador:

    countryCode
    languageCodes
    tier
    estado efectivo
    campaña actual
    suspensión o restricciones

De la campaña:

    market
    eligibleCountryCodes
    requiredLanguageCodes
    allowedTiers
    ventana temporal
    capacidad

Del manager y grupo:

    mercados autorizados
    idiomas
    campañas asignadas
    capacidad del grupo
    disponibilidad para meets

### Políticas

    CanBookMeet(creator, manager, availability, now)
    CanJoinCampaign(creator, campaign, now)
    CanJoinGroup(creator, campaign, group, manager, now)
    CanSubmitVideo(creator, campaignOrTrial, now)
    CanFinalizeCampaign(campaign, videos, now)

Cada política devuelve un resultado explicativo:

    eligible = true

    o

    eligible = false
    reasons = [country_not_allowed, manager_market_mismatch, ...]

Ejemplo: un creador de México no puede reservar con un manager limitado a España ni entrar en un grupo español, pero sí puede entrar en una campaña LATAM gestionada por un manager habilitado.

## Ausencia de jobs persistidos

No habrá una tabla jobs para cambiar estados cuando pase una fecha.

- Las lecturas calculan el estado efectivo con now.
- Las acciones validan ese estado antes de ejecutarse.
- Los listados filtran usando las fechas persistidas.
- Finalizar campañas, aprobar pruebas y marcar pagos siguen siendo acciones explícitas.

Así no existen estados obsoletos por un job fallido.

Los recordatorios no serán fuente de verdad. Si más adelante se necesita entrega fiable de notificaciones, se evaluará un outbox técnico independiente.

## Concurrencia, idempotencia y transacciones

### Concurrencia optimista

Todas las entidades mutables llevan version.

    UPDATE ugc_users
    SET status = ..., data = ..., version = version + 1
    WHERE id = ... AND version = ...;

Dos managers no pueden aprobar, asignar o finalizar simultáneamente el mismo agregado sin que uno reciba un conflicto explícito.

### Idempotencia

- Los pagos tienen unicidad por creador y campaña y `GeneratePayments` omite los ya existentes.
- Leads, usuarios, membresías y grupos tienen claves únicas que impiden duplicados relevantes.
- La idempotencia general por `command_id` se añadirá junto al sistema de eventos.

### Transacciones

Las escrituras relacionadas deben agruparse transaccionalmente en el adapter. Los pagos se generan con una acción administrativa separada después de finalizar la campaña, por lo que el cierre no depende de un proveedor de pagos.

## Autorización

Roles:

    creator
    manager
    admin

- Creator: modifica solo su perfil, requisitos, reservas y entregas permitidas.
- Manager: gestiona leads, onboarding, meets, trials y grupos dentro de su ámbito.
- Admin: configura campañas, ámbitos, cierres, pagos y excepciones.

La autorización combina:

1. Capacidad global del rol.
2. Ámbito concreto de mercado, campaña o grupo.

El backend comprueba ambos niveles en cada acción.

## Estrategia de pruebas

### 1. Tests unitarios de FSM

Una matriz por agregado:

    estado inicial
    acción
    contexto y now
    resultado esperado
    evento esperado
    error esperado

Cubrir:

- Todas las transiciones válidas.
- Transiciones prohibidas importantes.
- Límites exactos de fechas.
- Primera y segunda ausencia.
- Ocho vídeos en ocho días y configuraciones alternativas.
- Incompatibilidades de país, mercado, tier y manager.
- Suspensión y reanudación.
- Finalización idempotente.

### 2. Tests de políticas

Las políticas de elegibilidad son funciones puras y se prueban con matrices pequeñas. El mismo resultado alimenta la UI y la validación del comando.

### 3. Tests de services

Con repositories de prueba:

- Carga de entidades necesarias.
- Autorización del actor.
- Invocación de FSM o política.
- Coordinación de cambios relacionados.
- Persistencia transaccional.
- Conversión de conflictos y errores.

### 4. Tests de adapters

Con PGlite y, para garantías críticas, PostgreSQL:

- Claves foráneas.
- Relación compuesta grupo-campaña.
- Unicidad.
- Compare-and-swap.
- Deduplicación por command_id.
- Generación única de pagos.
- Roundtrip y decodificación de JSON.
- Rechazo de registros corruptos.
- Consultas y filtros reales.

### 5. Tests HTTP

Usar el cliente tipado para comprobar contratos, autorización, mapeo de errores, idempotency key y respuestas consumidas por frontend.

### 6. Tests frontend

Probar acciones disponibles, razones de inelegibilidad, carga, error, conflictos, invalidación de vistas y formularios variables. No acoplarse a detalles internos de atoms o componentes.

### Casos críticos de regresión

- Dos managers intentan aceptar al mismo applicant.
- Dos grupos intentan ocupar la última plaza.
- Un creador sube un vídeo justo al cerrar la ventana.
- Una campaña se finaliza dos veces.
- Se reintenta marcar un pago como pagado.
- Cambia una regla después de registrar un vídeo.
- Un JSON antiguo necesita migración.
- Un usuario mexicano se intenta asignar a un grupo solo España.

## Orden de implementación

### Fase 1 — Lenguaje y contratos

1. Schemas compartidos de estados, comandos, errores y datos versionados.
2. Funciones puras de estados efectivos.
3. Matrices de transición y políticas de elegibilidad.
4. Tests unitarios antes de la persistencia.

### Fase 2 — Persistencia

1. Migraciones de las ocho tablas.
2. Repository ports por agregado.
3. Adapters Drizzle con decode obligatorio.
4. CAS, transacciones, constraints y tests de adapter.

### Fase 3 — Captación y onboarding

1. Leads inbound y outbound.
2. Registro y enlace con autenticación.
3. Aceptación o rechazo.
4. Requisitos previos.
5. Reserva y resultado de meets.

### Fase 4 — Trial

1. Configuración versionada.
2. Calentamiento y publicación derivados.
3. Entrega de vídeos.
4. Evaluación, aprobación y rechazo.

### Fase 5 — Campañas y grupos

1. Creación y publicación.
2. Grupos y managers.
3. Importación de configuración.
4. Elegibilidad y asignación.
5. Entregas de campaña.

### Fase 6 — Cierre y pagos

1. Reconciliación de métricas.
2. Validación final.
3. Finalización transaccional.
4. Generación de pagos.
5. Exportación CSV y marcado como pagado.

### Fase 7 — Interfaces

1. Portal del creador.
2. Operativa de managers.
3. Administración de campañas, cierres y pagos.
4. Filtros y vistas por campaña, grupo y creador.

## Portal del creador — mapa de pantallas

La navegación principal del MVP tendrá cuatro destinos: `Inicio`, `Vídeos`, `Pagos` y `Perfil`. No habrá una pantalla separada llamada “Campaña actual”: cuando exista una prueba o campaña operativa, será el contenido principal de Inicio.

### Inicio

Inicio responde siempre a dos preguntas: qué está ocurriendo ahora y qué debe hacer el creador a continuación. La presentación se deriva del estado efectivo, no de rutas distintas para cada estado.

- applicant: solicitud recibida, fecha y acceso a los datos enviados.
- rejected: decisión, explicación permitida y contacto con soporte.
- onboarding: progreso, requisitos y única siguiente acción relevante.
- meeting_pending: explicación y reserva de reunión.
- meeting_scheduled: fecha, manager, acceso y cambio de reserva.
- follow_up_required: primera ausencia, advertencia y nueva reserva.
- trial/preparation: contrato, cuentas sociales y preparativos pendientes.
- trial/warming_up: guía y cuenta atrás hasta poder publicar.
- trial/publishing: objetivo, plazo, métricas, vídeos recientes y acción de subir.
- trial/awaiting_evaluation: resultado pendiente e histórico bloqueado.
- creator/waiting_campaign: confirmación de aprobación y disponibilidad.
- creator/campaign_scheduled: campaña, fechas, reglas, formatos, grupo y manager.
- creator/campaign_active: campaña como superficie principal, con progreso, views por plataforma, referidos, dinero estimado y vídeos recientes.
- creator/campaign_reconciliation: publicaciones cerradas, métricas en revisión y fecha prevista del resultado.
- campaña finalizada: pago generado y accesos a Pagos y Vídeos.
- suspended o exited: motivo visible permitido y acceso de solo lectura al histórico.

Durante una campaña activa se recuperan del panel anterior únicamente los datos accionables. Ranking, retos, reglas y tablas densas quedan fuera de Inicio. El desglose detallado permanece disponible en las superficies secundarias.

### Vídeos

La UI usa el término “Vídeos” o “Contenidos”; no introduce una entidad visible llamada “entrega”. Cada contenido agrupa:

- enlace de TikTok;
- enlace de Instagram;
- formato;
- fecha de publicación;
- referencia o indicación de contenido propio;
- views por plataforma y total;
- estado de revisión;
- fijo, bonus y total estimado.

La pantalla permite filtrar por campaña o prueba y buscar por título o campaña. Solo muestra “Subir vídeo” cuando `CanSubmitVideo` lo permite. El alta requiere ambas URLs, fecha, formato y referencia o contenido propio; la verificación de autoría y views será automática con alternativa manual cuando falle.

### Pagos

Muestra totales generado, pendiente y pagado. Separa pagos pendientes del histórico y permite abrir el desglose congelado de fijo, bonus y ajustes de cada campaña. Las estimaciones durante una campaña no son pagos y deben etiquetarse como tales.

### Perfil

Agrupa datos personales, país, idiomas, disponibilidad, cuentas verificadas de TikTok e Instagram, datos de cobro y documentos firmados. Los campos que condicionan la elegibilidad deben explicar que un cambio puede afectar a futuras campañas.

### Criterios de simplicidad y responsive

- Una acción primaria por estado; las acciones secundarias no compiten visualmente.
- Header horizontal con navegación centrada en escritorio y barra inferior en móvil.
- Tarjetas y listas en móvil; ninguna tabla horizontal es necesaria para el creador.
- El histórico completo queda fuera de Inicio.
- Los importes durante campaña se marcan como estimados y los vídeos pendientes de revisión se señalan explícitamente.
- Los estados sin acción no muestran botones artificiales.

## Decisiones abiertas

- Si un creador puede estar en varias campañas simultáneamente.
- Si un grupo puede tener varios managers.
- Si una campaña puede cambiar reglas después de publicarse.
- Qué requisitos exactos existen antes del meet.
- Cómo se calcula cada tier y bono.
- Qué métricas y momento de captura determinan el pago.
- Cómo se representan ajustes posteriores al pago.
- Qué capacidad y calendarios se usan para repartir meetings.

Estas preguntas no bloquean el esqueleto del MVP, pero pueden justificar nuevas tablas cuando aparezcan invariantes que no encajen honestamente en el modelo actual.

## Criterio de éxito arquitectónico

El modelo es correcto si:

- Ningún estado cambia mediante un parche arbitrario.
- Cada acción inválida falla con una razón de dominio.
- El mismo comando puede reintentarse sin duplicar efectos.
- Las fechas no requieren sincronizar jobs con estados persistidos.
- La base de datos protege relaciones y carreras importantes.
- Todos los JSON se decodifican mediante schemas versionados.
- Se puede explicar quién cambió una entidad y por qué.
- Añadir un estado o regla modifica una FSM y sus tests, no reparte condicionales por handlers y componentes.
