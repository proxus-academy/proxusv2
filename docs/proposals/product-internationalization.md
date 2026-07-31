# Internacionalización tipada para las aplicaciones de producto

## Estado

Implementada parcialmente en las aplicaciones de producto. La decisión inicial
de usar catálogos TypeScript explícitos ha sido reemplazada por la decisión de
adoptar i18next. El plan previo a implementación, sus gates y la estrategia de
migración incremental están en
[`../plans/product-i18next-migration.md`](../plans/product-i18next-migration.md).

El contenido de esta propuesta permanece como registro de la decisión anterior
y como fuente de requisitos que siguen vigentes. Sus secciones que prescriben
`MessagesCatalog`, `catalogFor()` o la ausencia de runtime global no describen
el estado objetivo.

Permanecen fuera de esta entrega la traducción de `StudyNode.name`, las superficies no alcanzables del wizard y la internacionalización del admin.

## Objetivo

Proporcionar traducciones tipadas con TypeScript para `apps/web` y `apps/mobile-web`, sin incluir `apps/admin`.

La solución debe cubrir:

- mensajes estáticos de producto;
- interpolación, plurales y formatos dependientes del locale;
- selección, detección y persistencia del idioma;
- mensajes de error seguros y localizados;
- etiquetas accesibles de los componentes de UI;
- reutilización entre web y mobile-web sin unificar artificialmente sus vistas.

## Fuera de alcance inicial

- Internacionalización de `apps/admin`.
- Traducción de contenido arbitrario generado por usuarios.
- Traducción de los nombres del catálogo de estudios, que actualmente llegan del servidor como `StudyNode.name`.
- Introducción de un router únicamente para soportar el idioma.
- Carga de traducciones desde un servicio remoto o TMS.

## Situación actual

Las aplicaciones de producto usan React 19, Vite 7, TypeScript y Effect Atom. Comparten comportamiento en `packages/frontend-core`, adapters de navegador en `packages/frontend-web` y componentes en `packages/ui`, pero mantienen vistas diferentes.

Actualmente:

- los mensajes visibles están escritos directamente en español;
- no existe infraestructura de internacionalización;
- ambos documentos declaran `<html lang="es">`;
- no hay router de aplicación;
- el wizard conserva su path mediante el query parameter `path`;
- no hay preferencia de idioma persistida;
- algunas primitivas de `packages/ui` contienen etiquetas españolas;
- los nombres del catálogo se reciben como texto ya resuelto por el backend.

## Decisión propuesta

### Catálogos TypeScript

Los mensajes se definen mediante un `MessagesCatalog` explícito. Cada propiedad es un `string` o una función tipada que recibe un objeto de parámetros y devuelve `string`. Todos los locales usan `satisfies MessagesCatalog`, y el mapa de catálogos usa `satisfies Record<Locale, MessagesCatalog>`.

API de consumo:

```ts
const m = useMessagesCatalog()

m.common.back
m.registration.progress({ current: 2, total: 5 })
```

Esto comprueba claves, completitud de locales y parámetros sin código generado, runtime global ni locale props. Los mensajes de error permanecen predefinidos en el catálogo; el matching exhaustivo entre errores públicos Effect y mensajes vive en código de presentación separado.

### Locales iniciales

La primera entrega soportará:

```ts
type Locale = "es" | "en"
```

El español será el locale de fallback.

Añadir un locale requerirá su catálogo completo y deberá fallar en CI si faltan mensajes obligatorios.

## Distribución por capas

### Catálogo compartido de producto

Estructura implementada:

```text
packages/product-messages/
├── src/
│   ├── catalog.ts
│   ├── catalog.test.ts
│   ├── index.ts
│   └── study-catalog-error-message.ts
├── package.json
└── tsconfig.json
```

Este paquete contiene locales soportados, el contrato de catálogo, los catálogos completos y mappers de presentación compartidos que convierten errores públicos tipados a mensajes predefinidos.

No contendrá copy del admin. Tampoco contendrá decisiones visuales específicas de una aplicación salvo que el mensaje sea realmente compartido.

### Fuente de verdad y estado independiente de plataforma

El locale efectivo expuesto mediante Effect Atom es la única fuente de verdad reactiva. `useMessagesCatalog()` lee ese atom y devuelve el objeto estable correspondiente desde `catalogs[locale]`. No existe runtime de traducción global, Context adicional ni prop drilling de locale.

Los mensajes parametrizados se evalúan durante render; nunca se almacenan strings traducidos como estado de larga vida.

Añadir una capacidad de locale en `packages/frontend-core/src/product-locale`:

```text
locale.ts
atoms.ts
testing.ts
```

Responsabilidades:

- tipo o Schema de `Locale`;
- política de fallback sobre valores no soportados;
- factory de atoms de lectura y cambio de locale;
- adapter en memoria para pruebas.

El locale es estado de aplicación y debe modelarse atom-first. Los componentes no deben copiarlo a `useState` ni derivar traducciones mediante `useEffect`.

### Adapter de navegador

Añadir en `packages/frontend-web/src/product-locale`:

```text
locale-preference.ts
document-locale.ts
```

Responsabilidades:

- leer un locale explícito de la URL;
- leer y escribir una preferencia persistida;
- detectar `navigator.languages`;
- reaccionar a cambios externos relevantes;
- sincronizar `document.documentElement.lang`;
- encapsular `window`, `document`, `navigator` y almacenamiento web.

La composition root de cada aplicación seleccionará y conectará estos adapters. `frontend-core` no accederá directamente a globals del navegador.

### Aplicaciones

`apps/web` y `apps/mobile-web`:

- compondrán la capacidad de locale;
- proporcionarán el selector de idioma;
- consumirán las funciones de mensaje tipadas;
- conservarán sus vistas y layouts propios;
- podrán definir mensajes específicos cuando la experiencia de ambas superficies sea diferente.

No se unificarán componentes solo porque su copy sea parecido.

## Resolución y persistencia del locale

La regla pura de resolución pertenecerá a `frontend-core`; los adapters web solo aportarán candidatos y mecanismos. La precedencia propuesta es:

```text
locale válido explícito en URL
→ preferencia explícita persistida
→ idiomas del navegador
→ español
```

La primera fase usará almacenamiento local funcional, no cookies. Se distinguirá la preferencia explícita del locale efectivo. Solo una acción del selector persistirá la preferencia; abrir un enlace con `lang` no la sobrescribirá. Debe existir una acción «usar idioma del dispositivo» que elimine la preferencia. Los fallos o bloqueo del almacenamiento degradarán de forma segura y no impedirán arrancar.

En la primera fase se usará el query parameter `lang`, compatible con el actual `path`:

```text
/?lang=en&path=...
```

Reglas:

- `lang` ausente continúa con preferencia, navegador y fallback;
- un locale soportado y canónico gana la resolución de ese enlace;
- tags regionales como `en-US` solo se reducirán a `en` mediante una tabla explícita;
- valores vacíos, duplicados o no soportados se ignorarán, no se persistirán y podrán retirarse con `replaceState`;
- la inicialización no creará una entrada de historial;
- se decidirá explícitamente si una selección posterior usa `pushState` o `replaceState`;
- back/forward deberá mantener el locale reactivo sin alterar automáticamente la preferencia persistida;
- la escritura conservará pathname, hash, otros query parameters y `history.state`;
- el adapter emitirá también los cambios realizados mediante `pushState`/`replaceState`, porque estos no disparan `popstate`;
- se evaluará una única seam de URL reactiva para coordinar `lang` con el actual `path` y evitar escrituras o listeners que compitan;
- la implementación debe ser segura bajo React Strict Mode y varias pestañas;
- la clave y formato de persistencia estarán versionados y manejarán excepciones de almacenamiento.

Antes del primer `createRoot().render(...)` se resolverá el locale inicial, se configurará el runtime, se actualizarán `lang` y `dir`, y se inicializarán los atoms. No se mostrará primero copy español a un usuario resuelto como inglés. La transición `selectLocale` tendrá ownership único y distinguirá eventos del usuario, historial y almacenamiento externo para evitar ciclos. La persistencia será best-effort; el runtime, atom y documento deberán cambiar como una única transición observable.

Si posteriormente se requieren URLs indexables por idioma, se evaluará un router y prefijos como `/es/` y `/en/`. No se introducirán en esta fase.

## Mensajes de error

### Principio

No se traducirán strings técnicos ni se implementará un mapper global de `Error` a texto.

El flujo será:

```text
error interno del backend
→ error público tipado
→ clasificación de frontend
→ presentación localizada
```

Los errores esperables y visibles para el cliente deben ser discriminated unions estables, compartidas mediante `packages/shared` cuando crucen HTTP.

El plan no inventará variantes para facilitar el copy. En el contrato actual de study-catalog los errores públicos esperables incluyen `StudyNodeNotFound` y `StudyEdgeNotFound`; el `500` se expone de forma segura sin cuerpo. `StudyCatalogUnavailable` o `RateLimitExceeded` solo se añadirían mediante una decisión de API independiente si existiera semántica real que el cliente necesitase distinguir.

La presentación distinguirá dos niveles:

```ts
type StudyCatalogExpectedError =
  | StudyNodeNotFound
  | StudyEdgeNotFound

type StudyCatalogFailurePresentationInput =
  | { readonly _tag: "Expected"; readonly error: StudyCatalogExpectedError }
  | { readonly _tag: "Unavailable" }
  | { readonly _tag: "Unexpected"; readonly incidentId?: string }
```

La adaptación del cliente conservará errores públicos conocidos, clasificará como `Unavailable` solo fallos operacionales inequívocos y enviará fallos de protocolo/decoding y defectos a `Unexpected` con observabilidad. No se confundirán errores de decoding HTTP con errores del dominio.

No se inferirá semántica comparando `error.message`, ni el backend enviará claves del catálogo de traducciones.

### Presentación, no solo texto

Los mappers producirán una presentación que pueda incluir acciones:

```ts
type ErrorPresentation = {
  readonly title: string
  readonly description?: string
  readonly action?: {
    readonly label: string
    readonly kind: "retry" | "goBack" | "signIn"
  }
}
```

Cada bounded context tendrá un mapper exhaustivo sobre la unión que realmente recibe. Se utilizará `Match.exhaustive` de Effect o un `assertNever`, en vez de confiar en un `switch` sin rama final. Añadir una variante pública sin definir su presentación deberá producir un error de TypeScript.

`frontend-core` podrá clasificar el fallo en una intención semántica sin strings, por ejemplo `NotFound`, `RetryableRead` o `Unexpected`. La app transformará esa intención y el locale actual en copy y acciones ejecutables. Los strings localizados no se almacenarán en atoms. `retry` solo se ofrecerá para operaciones declaradas seguras e idempotentes.

Los mappers vivirán cerca del módulo consumidor. La clasificación independiente de plataforma podrá compartirse en `frontend-core`; la decisión final de copy y UX permanecerá en la presentación o en una función compartida solo cuando ambas apps tengan exactamente la misma experiencia.

### Errores desconocidos

Los errores técnicos o inesperados:

- se registrarán una sola vez con su causa y contexto en el boundary definido;
- no mostrarán `String(error)` ni detalles internos;
- usarán un mensaje genérico localizado;
- podrán incluir un identificador de incidencia seguro si la infraestructura lo proporciona.

Ejemplo:

```text
es: Ha ocurrido un error inesperado. Inténtalo de nuevo.
en: Something went wrong. Please try again.
```

Los errores de validación de formularios seguirán el mismo principio: código o variante semántica más parámetros, nunca texto español almacenado como estado de dominio.

Matriz mínima de tratamiento:

| Fallo | Clasificación para UI |
| --- | --- |
| Validación local | Mensaje localizado de validación |
| Decoding HTTP de request | Solicitud inválida genérica; no interpretar texto técnico |
| Error público declarado | Mapper exhaustivo por `_tag` |
| Red/timeout de una lectura segura | Indisponible con reintento |
| `500` sin cuerpo | Inesperado seguro |
| Decoding de response/protocolo incompatible | Inesperado seguro más observabilidad |
| Defecto/interrupción | Boundary de runtime; no mostrar la causa |

Los parámetros de copy y telemetría se construirán mediante allowlist. IDs, payloads completos, URLs controladas por usuario y `Schema.Defect` no se interpolarán o registrarán por defecto. La primera entrega no requiere cambiar contratos o backend para traducir los errores actuales; cualquier mejora de observabilidad del servidor será un cambio separado y no alterará la respuesta pública sin una necesidad de producto.

## Componentes de UI y accesibilidad

`packages/ui` no dependerá del runtime de traducciones de producto.

Las primitivas con copy interno deberán aceptar etiquetas mediante props, especialmente:

- cerrar un diálogo;
- quitar un badge;
- estado vacío de combobox;
- nombre y navegación de paginación.

Ejemplo:

```tsx
<Dialog closeLabel={m.common_close()} />

<Pagination
  label={m.pagination_label()}
  previousLabel={m.pagination_previous()}
  nextLabel={m.pagination_next()}
/>
```

Durante una migración compatible se podrán conservar defaults, pero toda superficie de producto deberá proporcionar etiquetas localizadas. Las stories relevantes mostrarán ambos idiomas y las pruebas consultarán nombres accesibles observables.

## Contenido localizado del catálogo

`StudyNode.name` es contenido del dominio servido por el backend y no se puede traducir correctamente sustituyendo strings en frontend.

La primera fase no lo modifica. Si producto necesita nombres localizados, se diseñará una fase transversal con:

- contrato compartido que transporte el locale o el nombre resuelto;
- persistencia de traducciones y fallback;
- service y repository port;
- handler HTTP;
- cache keys que incluyan el locale;
- cliente frontend;
- pruebas de service, adapter y HTTP.

Se prefiere que el backend resuelva el nombre solicitado y su fallback, en vez de enviar todas las traducciones en cada respuesta.

Las decisiones visuales no deben depender del nombre localizado. Comparaciones como `node.name === "España"` deberán sustituirse por una identidad o código estable.

## Extracción y organización de mensajes

Convenciones iniciales:

- IDs semánticos y estables, no el texto fuente como ID;
- agrupación por bounded context y superficie, por ejemplo `registration_*` y `studyCatalog_*`;
- parámetros con nombres semánticos y tipos verificables;
- no concatenar fragmentos para formar frases;
- usar plural/select del motor para variaciones gramaticales;
- centralizar mensajes realmente comunes con moderación;
- evitar un catálogo `common` que oculte diferencias de contexto;
- añadir notas para traducción cuando el significado no sea evidente.

## Carga y rendimiento

La primera fase no implementa lazy loading: los catálogos TypeScript son pequeños y se incluyen en el bundle de producto. Si su tamaño justificase partición, se redactará una propuesta separada con límites de chunk, preload, recuperación y comportamiento durante el cambio de locale.

## Pruebas

### Catálogos

- el typecheck falla ante parámetros incorrectos;
- `satisfies MessagesCatalog` valida cada catálogo;
- `Record<Locale, MessagesCatalog>` valida locales completos;
- build de las dos aplicaciones consume el mismo package;
- no existen artefactos generados ni writers concurrentes.

### `frontend-core`

- selección de locale soportado;
- fallback de locale desconocido;
- transiciones mediante adapter en memoria;
- ausencia de dependencias de globals del navegador.

### `frontend-web`

- precedencia URL/preferencia/navegador/fallback;
- parseo de `lang` inválido;
- conservación de otros query parameters;
- reacción a back/forward;
- persistencia y recuperación;
- sincronización y cleanup de `<html lang>`;
- comportamiento idempotente bajo montaje estricto.

### Aplicaciones

- copy observable en español e inglés;
- cambio de idioma durante el wizard sin perder el path;
- estados loading, empty, failure y success;
- mensajes y acciones de errores públicos;
- fallback genérico para errores desconocidos;
- nombres accesibles localizados.

### UI y Storybook

- sustituir el script de test no-op actual de `@proxus/ui` por una suite real antes de declarar validada la migración;
- configurar Vitest con entorno DOM y Testing Library, o la alternativa real adoptada por el workspace;
- props obligatorias de etiquetas accesibles en el estado final, con deprecación acotada si hay migración compatible;
- stories de estados relevantes en ambos idiomas y pseudo-locale de expansión;
- prueba de navegador o runner de Storybook/a11y real, no solo addons instalados;
- no acoplar tests a la implementación interna del motor ni aprobar copy mediante snapshots masivos.

Criterios observables de accesibilidad:

- selector con nombre, valor actual y operación por teclado;
- progreso con rol y valores accesibles;
- política de foco al cambiar paso o idioma;
- estados de loading/finalización anunciados y errores nuevos con semántica adecuada;
- conservación del foco al rerenderizar copy;
- revisión de reflow a 320 CSS px y zoom 200/400 %;
- sincronización de `dir` junto a `lang`; aunque `es` y `en` sean LTR, las APIs nuevas no impedirán RTL y se preferirán propiedades lógicas.

## Observabilidad y privacidad

- registrar el locale como contexto útil, no como identidad del usuario;
- no incluir datos sensibles en parámetros de mensajes ni telemetría;
- separar el mensaje mostrado del detalle técnico registrado;
- detectar fallos inesperados al resolver locale o presentar errores;
- no utilizar traducciones para construir claves de métricas de alta cardinalidad.

## Plan de entrega

### Fase -1: decisiones de producto

1. Aprobar política de URL, historial, almacenamiento local y privacidad.
2. Cerrar el inventario de superficies alcanzables, metadata y copy.
3. Decidir si el producto puede lanzar inglés con nombres del catálogo en español; si no, la fase de catálogo pasa a ser gate del lanzamiento.
4. Definir variante lingüística (`es-ES` y `en-GB` o `en-US`), tono, glosario, owner y revisión humana.
5. Aprobar requisitos de accesibilidad, formatos y deuda explícita de RTL.

### Fase 0: spike técnico completado

1. Se evaluó Paraglide y se descartó por complejidad de runtime, generación y tipado insuficiente de interpolaciones simples.
2. Se validó un contrato TypeScript explícito con strings y funciones parametrizadas.
3. Se adoptó Effect Atom como única fuente reactiva del locale.
4. Se expuso `useMessagesCatalog()` como API de consumo sin prop drilling.
5. Se validó consumo desde web, mobile-web y el package compartido.

### Fase 1: infraestructura y wizard

1. Crear `packages/product-messages`.
2. Añadir `Locale`, fallback y atoms.
3. Implementar adapters web y persistencia.
4. Sincronizar URL y `<html lang>`.
5. Añadir selector de idioma en ambas apps.
6. Migrar copy y etiquetas accesibles del wizard.
7. Introducir mappers de errores públicos por módulo.
8. Añadir pruebas y documentación.

### Fase 2: sistema de diseño

1. Inventariar todo copy interno de `packages/ui`.
2. Exponer etiquetas mediante props sin introducir dependencia del runtime.
3. Migrar consumidores de producto.
4. Añadir stories y pruebas accesibles.

### Fase 3: contenido de catálogo

Solo si se confirma como requisito de producto:

1. definir modelo y política de fallback;
2. actualizar API y documentación;
3. implementar persistencia, repository y service;
4. actualizar cliente y cache keys;
5. eliminar decisiones basadas en nombres visibles;
6. validar extremo a extremo.

## Capas afectadas

Primera entrega:

```text
- contrato compartido/API: solo si hay que tipar errores públicos ausentes
- persistencia y repositories backend: no
- services/casos de uso backend: no
- handlers HTTP: solo si hoy filtran errores internos o no discriminan errores públicos
- frontend core/atoms: sí
- adapters frontend web: sí
- UI, pantallas y navegación: sí
- tests y fixtures: sí
- documentación: sí
- admin: no
```

La localización del catálogo convertiría contrato, persistencia, repositories, services y handlers en áreas afectadas.

## Validación prevista

Durante la implementación se ejecutará, como mínimo:

```bash
pnpm --filter @proxus/product-messages typecheck
pnpm --filter @proxus/frontend-core typecheck
pnpm --filter @proxus/frontend-core test
pnpm --filter @proxus/frontend-web typecheck
pnpm --filter @proxus/frontend-web test
pnpm --filter @proxus/web typecheck
pnpm --filter @proxus/web test
pnpm --filter @proxus/web build
pnpm --filter @proxus/mobile-web typecheck
pnpm --filter @proxus/mobile-web test
pnpm --filter @proxus/mobile-web build
```

Los nombres exactos de filtros y scripts se confirmarán contra los `package.json` reales antes de ejecutarlos. Si cambian contratos Effect, también se ejecutarán los diagnostics y tests proporcionales definidos en `AGENTS.md`.

## Preguntas abiertas que deben cerrarse en sus gates

1. ¿Debe `lang` permanecer siempre visible en la URL o solo cuando difiere del fallback?
2. ¿Una selección del usuario crea una entrada de historial o reemplaza la actual?
3. ¿Debe el idioma seguir la cuenta del usuario cuando exista autenticación?
4. ¿El cambio de idioma durante el wizard es un requisito de la primera entrega?
5. ¿Los nombres del catálogo deben estar localizados antes del lanzamiento público en inglés?
6. ¿Se usará `en-GB` o `en-US`, y quién aprueba el copy?
7. ¿Las traducciones se revisarán solo en Git o se integrará un TMS?
8. ¿Qué formatos de fecha, zona horaria, número, lista, moneda y unidades necesita realmente la primera superficie?
9. ¿Qué estrategia futura de SSR se quiere preservar? La primera fase se valida exclusivamente como CSR.

## Criterios de aceptación de la primera entrega

- Web y mobile-web pueden alternar entre español e inglés.
- El locale inicial sigue la precedencia documentada.
- Cambiar el idioma no pierde el estado del wizard.
- `<html lang>` y `<html dir>` reflejan el locale activo antes del primer render.
- No aparece copy del locale incorrecto durante el arranque o el cambio.
- Los mensajes y sus parámetros se validan mediante TypeScript.
- Los errores esperables se presentan mediante mappers exhaustivos.
- Los errores inesperados muestran un fallback seguro y se conservan para observabilidad.
- El inventario acordado no contiene copy español no intencional al usar inglés.
- Las etiquetas accesibles visibles en producto están localizadas y se validan foco, teclado, progreso y anuncios de estado.
- `packages/ui` no depende del runtime de traducciones y dispone de una suite real, no un script no-op.
- Admin no cambia.
- Los tests y builds de ambas aplicaciones pasan.
