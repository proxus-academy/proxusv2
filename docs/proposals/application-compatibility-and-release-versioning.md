# Propuesta: compatibilidad y versionado entre aplicaciones

## Estado

Propuesta inicial.

## Contexto

Proxus tendrá varios consumidores y procesos que evolucionarán a ritmos distintos:

- aplicación web;
- aplicación administrativa;
- aplicaciones móviles;
- API HTTP;
- workers y consumidores de eventos;
- migraciones de base de datos;
- actualizaciones OTA de React Native.

En web podemos controlar cuándo se publica una versión. En móvil, una versión antigua puede permanecer instalada durante meses. Por tanto, el sistema debe asumir despliegues desincronizados y la convivencia de múltiples versiones.

Actualmente se prioriza la suite de Google Cloud, pero se quiere limitar el vendor lock-in.

## Decisión propuesta

No versionar Proxus como una única unidad. Versionar los contratos y gestionar explícitamente la compatibilidad entre componentes.

Principios:

1. Contratos compartidos y verificados automáticamente.
2. Evolución compatible y aditiva por defecto.
3. Migraciones `expand → migrate → contract`.
4. Ventana explícita de soporte para clientes antiguos.
5. Capacidades y feature flags para coordinar activaciones.
6. Observabilidad con las versiones de cliente, servidor y contrato.
7. Infraestructura basada en estándares, aunque se ejecute en GCP.

## Capas versionadas

### Contratos HTTP

`packages/shared` contiene los schemas, contratos públicos y errores de cada bounded context, sin depender de la implementación del servidor:

```text
packages/shared/
└── study-catalog/
    ├── schemas
    ├── http-contract
    ├── errors
    └── capabilities
```

Web, admin, mobile y server compilan contra estos contratos. El backend debe mantener compatibilidad con las versiones móviles todavía soportadas.

### Lógica frontend compartida

La lógica reutilizable debería residir en un package independiente, por ejemplo:

```text
packages/frontend-core/
├── api-client
├── atoms
├── estado remoto
├── mutaciones
├── modelos de vista
└── resolución de capacidades
```

No deberían compartirse forzosamente componentes visuales, navegación, layouts ni integraciones nativas. Web y mobile comparten semántica, no necesariamente UX.

### Eventos

Los eventos son contratos públicos e inmutables:

```text
packages/shared/events/
├── StudyCreatedV1
├── StudyUpdatedV1
└── ExperimentExposedV1
```

Un evento publicado no cambia de significado. Los cambios incompatibles crean una nueva versión.

### Base de datos

El schema SQL no es un contrato para las aplicaciones. Solo los adapters de persistencia deberían conocerlo. Los clientes consumen servicios y contratos HTTP, nunca tablas directamente.

## Evolución de la API

No se creará una nueva versión global de la API ante cada cambio menor. Se favorecerán cambios aditivos.

Cambios normalmente compatibles:

- añadir campos opcionales;
- añadir endpoints;
- aceptar formatos anterior y nuevo durante una transición;
- introducir defaults explícitos;
- añadir capacidades sin alterar las existentes.

Cambios incompatibles:

- eliminar o renombrar campos;
- convertir un campo opcional en obligatorio;
- cambiar el significado de un estado o error;
- cambiar el formato de fechas o identificadores;
- añadir valores que los clientes antiguos no puedan interpretar.

Cuando el cambio sea realmente incompatible, se mantendrán temporalmente ambas versiones:

```text
/api/studies/:id
/api/v2/studies/:id
```

### Enums y valores desconocidos

Los clientes remotos deben tolerar valores futuros. Los schemas de frontera deberían modelar un valor desconocido o proporcionar un fallback seguro, especialmente para estados y discriminantes que puedan ampliarse.

## Versiones y capacidades

Los números de versión se usarán para diagnóstico y políticas de soporte. Las decisiones funcionales se basarán preferentemente en capacidades.

Cada cliente enviará metadatos equivalentes a:

```http
X-Proxus-Client: mobile
X-Proxus-Version: 2.4.1
X-Proxus-Runtime: mobile-7
X-Proxus-Contract: 3
```

El servidor podrá anunciar:

```json
{
  "minimumSupportedVersion": "2.1.0",
  "latestVersion": "2.5.0",
  "capabilities": {
    "studyArchive": true,
    "newEnrollmentFlow": false
  }
}
```

El código comprobará capacidades como `study-archive` en lugar de inferir comportamiento a partir de comparaciones de versiones.

## Despliegue y activación

Desplegar código, distribuirlo y activar comportamiento son operaciones diferentes.

Flujo para una funcionalidad transversal:

1. Expandir el schema de base de datos.
2. Desplegar un backend compatible con clientes antiguos.
3. Desplegar clientes con la funcionalidad desactivada.
4. Verificar estabilidad y adopción.
5. Activar mediante capability o feature flag.
6. Retirar contratos, código y schema antiguos en releases posteriores.

Las feature flags no sustituyen a la autorización ni a la compatibilidad contractual.

## Migraciones `expand → migrate → contract`

Las migraciones destructivas no se publicarán junto con el primer código que usa el nuevo schema.

Ejemplo al sustituir `title` por `display_name`:

### Expand

- añadir `display_name`;
- mantener `title`;
- aceptar ambos formatos;
- escribir temporalmente en ambos cuando sea necesario.

### Migrate

- ejecutar el backfill;
- migrar clientes y servicios;
- observar que no quedan consumidores dependientes del formato anterior.

### Contract

- dejar de utilizar `title`;
- retirarlo de los contratos;
- eliminar la columna en una release posterior.

Esta estrategia permite despliegues desordenados y rollback sin pérdida de integridad.

## React Native y OTA

Se distinguirán tres identificadores:

```text
App version       2.4.1
Build number      187
Runtime version   mobile-7
```

- **App version:** versión visible para el usuario.
- **Build number:** binario nativo exacto.
- **Runtime version:** compatibilidad del binario con bundles OTA.

La política móvil definirá:

- versión mínima soportada;
- versión recomendada;
- runtimes compatibles;
- actualización opcional;
- actualización obligatoria solo cuando sea imprescindible.

Una actualización OTA:

- solo se publica para runtimes compatibles;
- pasa primero por canales internos y staging;
- puede desplegarse gradualmente;
- utiliza feature flags separadas para la activación funcional;
- incluye commit y release;
- dispone de una estrategia de rollback;
- nunca requiere un contrato que el backend aún no soporte.

El backend debe tolerar varias versiones móviles simultáneamente.

## Manifest de release

Cada artefacto desplegable generará un manifest portable:

```json
{
  "release": "2026.07.15.3",
  "commit": "abc123",
  "contracts": {
    "http": 4,
    "events": 2
  },
  "database": {
    "migration": "0018"
  },
  "clients": {
    "web": "1.8.0",
    "admin": "1.3.0",
    "mobileRuntime": "mobile-7"
  }
}
```

El manifest se incluirá en despliegues, logs, trazas e informes de error para identificar la combinación exacta de cliente, API, contrato, runtime y migración.

## Verificación automática

Cada PR debería validar, progresivamente, esta matriz:

```text
Servidor nuevo + contratos nuevos
Servidor nuevo + clientes actuales
Servidor nuevo + versión móvil mínima soportada
Migración desde el schema de producción
Consumers antiguos + eventos nuevos compatibles
```

Herramientas y prácticas:

- Effect Schema como fuente de verdad;
- tests contractuales con Vitest;
- OpenAPI generado desde los contratos cuando sea necesario;
- detección automática de breaking changes;
- PGlite para tests rápidos;
- PostgreSQL real para integración y migraciones antes de promover una release;
- Playwright para web y admin;
- Maestro o Detox para mobile.

## Google Cloud sin acoplamiento innecesario

| Necesidad | Servicio GCP | Frontera portable |
|---|---|---|
| Contenedores | Cloud Run | imágenes OCI |
| Base de datos | Cloud SQL | PostgreSQL estándar |
| Objetos | Cloud Storage | port `ObjectStorage` |
| Eventos | Pub/Sub | port `EventPublisher`/`EventBus` |
| Secretos | Secret Manager | configuración y adapter |
| Telemetría | Cloud Monitoring | OpenTelemetry |
| CI/CD | Cloud Build | scripts versionados en el repositorio |
| Distribución móvil | Firebase App Distribution | APK/IPA estándar |

### Cloud Run

Los servicios se empaquetarán como imágenes OCI ejecutables localmente y en otros proveedores. La lógica de aplicación no dependerá de APIs específicas de Cloud Run.

### Cloud SQL

Se utilizará PostgreSQL estándar. Las particularidades de conexión de Cloud SQL permanecerán en configuración e infraestructura. Se evitarán extensiones exclusivas salvo que aporten un valor explícito y aceptado.

### Pub/Sub

Los servicios de dominio no importarán el SDK de Google:

```text
service → EventPublisher port → GooglePubSub adapter
```

Los mensajes utilizarán schemas propios y versionados.

### Cloud Storage

La infraestructura implementará el port existente:

```text
ObjectStorage
├── LocalObjectStorage
└── GoogleCloudStorage
```

El dominio no recibirá tipos del SDK de Google.

### OpenTelemetry

La aplicación se instrumentará con OpenTelemetry y exportará mediante un collector:

```text
Aplicación → OpenTelemetry → Collector → Google Cloud
                                      └→ otro backend
```

### CI/CD

Cloud Build orquestará comandos que viven en el repositorio:

```bash
pnpm verify
pnpm db:migrate
pnpm db:seed:qa
pnpm release:manifest
```

Esto permitirá trasladar el pipeline a otro sistema sin reescribir la lógica de release.

## Estructura objetivo orientativa

```text
packages/
├── shared/               # dominio, schemas y contratos
├── frontend-core/        # atoms, API client y lógica compartida
├── observability/        # instrumentación OpenTelemetry
└── release-contracts/    # capabilities y manifest

apps/
├── server/
│   ├── modules/
│   └── infrastructure/
│       ├── postgres/
│       ├── google-cloud-storage/
│       └── google-pubsub/
├── web/
├── admin/
└── mobile/
```

Esta estructura es orientativa; cada extracción se realizará cuando exista una necesidad real y suficiente evidencia de reutilización.

## Políticas iniciales

1. La API evoluciona aditivamente por defecto.
2. Mobile mantiene una ventana explícita de versiones soportadas.
3. Los eventos publicados no cambian de significado.
4. Las migraciones destructivas requieren varias releases.
5. Las funcionalidades transversales se activan con flags.
6. Las peticiones y trazas incluyen información de versión.
7. Cada despliegue genera un manifest.
8. Las dependencias de GCP quedan confinadas a adapters y configuración.
9. Producción utiliza artefactos y protocolos estándar siempre que sea razonable.
10. Los tests cubren la versión actual y la mínima soportada.

## Adopción incremental

### Fase 1

- documentar la política de compatibilidad;
- identificar contratos HTTP y eventos públicos;
- añadir metadatos de cliente y servidor a la telemetría;
- definir la versión móvil mínima soportada.

### Fase 2

- generar manifests de release;
- automatizar la detección de breaking changes;
- establecer migraciones `expand → migrate → contract`;
- introducir capabilities para el primer flujo transversal.

### Fase 3

- probar la matriz de clientes soportados;
- automatizar previews por PR;
- introducir rollout gradual y rollback de OTA;
- añadir adapters GCP detrás de ports propios.

## Consecuencias

### Beneficios

- despliegues independientes más seguros;
- soporte explícito para clientes móviles antiguos;
- mejor diagnóstico de incompatibilidades;
- activaciones reversibles;
- menor dependencia de Google Cloud;
- migraciones y rollbacks más predecibles.

### Costes

- mantenimiento temporal de contratos y schemas antiguos;
- mayor disciplina en migraciones y eventos;
- necesidad de telemetría y matrices de compatibilidad;
- complejidad adicional en releases móviles;
- retirada planificada de versiones obsoletas.

## Cuestiones pendientes

- duración exacta de la ventana de soporte móvil;
- herramienta de feature flags y experimentación;
- proveedor o implementación para actualizaciones OTA;
- política de deprecación de contratos;
- formato definitivo y almacenamiento del manifest;
- mecanismo para detectar breaking changes en CI;
- límites aceptables de dependencia de cada servicio GCP.
