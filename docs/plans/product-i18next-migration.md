# Plan de migración de internacionalización a i18next

## Estado

Implementada para las superficies de producto de `apps/web`.

Este documento reemplaza la decisión de usar catálogos TypeScript ejecutables
descrita en `docs/proposals/product-internationalization.md`. Conserva las
decisiones todavía válidas de aquella propuesta: ownership del locale,
separación por plataforma, errores semánticos, accesibilidad y exclusión del
contenido de dominio localizado.

El spike, la migración de auth y registro, la retirada del catálogo anterior y
los gates de validación se han completado. Astro y React Native permanecen como
contratos preparados; no se han creado aplicaciones vacías.

## Objetivo

Adoptar `i18next` como motor compartido de mensajes y `react-i18next` como
integración React, sin delegar en la librería el routing, la persistencia ni el
estado de aplicación.

La primera migración real cubre `apps/web`. La arquitectura resultante debe
permitir añadir posteriormente:

- una aplicación Astro con aislamiento de locale por request;
- una aplicación React Native con adapters nativos;
- extracción de mensajes y un TMS sin volver a cambiar la API de consumo.

No se añadirán shells vacíos de Astro o React Native como parte de esta
migración.

## Resultado esperado

```text
URL /:locale o navegación nativa
              │
              ▼
     locale de aplicación tipado
              │
       ┌──────┴─────────┐
       ▼                ▼
Effect Atom       instancia i18next
transiciones      mensajes y formatos
       │                │
       └──────┬─────────┘
              ▼
          vistas React
```

Responsabilidades:

- `@proxus/product-messages` define locales, recursos, namespaces y factories
  neutrales de framework.
- `frontend-core` conserva transiciones semánticas y atoms de locale, pero no
  importa `i18next` ni almacena strings traducidos.
- cada app crea y posee su instancia de i18next en su composition root;
- `react-i18next` solo aparece en aplicaciones React;
- el router de cada plataforma continúa siendo la fuente del locale navegable;
- los adapters de plataforma resuelven dispositivo, persistencia, documento y
  navegación.

## Decisiones cerradas

### 1. Librerías

- `i18next` será el motor de mensajes.
- `react-i18next` será la integración de las vistas React.
- Astro seguirá usando `astro:i18n` para routing, enlaces, redirects y
  `hreflang`; i18next solo resolverá mensajes.
- React Native usará su navegación y sus adapters de dispositivo y
  almacenamiento; i18next no seleccionará esos mecanismos.

No se instalarán inicialmente plugins de detector, backend HTTP o cache. La
selección y persistencia ya tienen ownership en la aplicación, y los dos
catálogos iniciales se incluirán en el bundle.

### 2. Fuente de verdad

El locale efectivo de la aplicación seguirá siendo tipado y observable mediante
Effect Atom. En web es una proyección del parámetro validado del router.

i18next refleja ese locale y resuelve mensajes. El evento global
`languageChanged` no se usará para crear una segunda fuente de verdad ni para
escribir de vuelta en el router.

Una selección iniciada por el usuario ejecutará una única transición:

```text
selectLocale(locale)
→ navegar reemplazando solo :locale
→ actualizar preferencia explícita
→ publicar el nuevo estado observable
→ presentar los mensajes del nuevo locale
```

La composición debe garantizar que no exista un render observable con URL
inglesa y mensajes españoles, o viceversa.

### 3. Nombre y límite del package

Se conservará inicialmente el nombre `@proxus/product-messages`. Renombrarlo a
`@proxus/product-i18n` no aporta comportamiento y ampliaría el diff de
migración. El nombre podrá reconsiderarse en un cambio mecánico posterior.

El package podrá depender de `i18next`, pero no de React, Astro, React Native,
DOM, almacenamiento ni routers.

### 4. Locales y tags de formato

Los locales de ruta permanecen:

```ts
type Locale = "es" | "en"
```

Se definirá separadamente el tag usado por `Intl`:

```ts
const localeTags = {
  es: "es-ES",
  en: "en-GB",
} satisfies Record<Locale, string>
```

`en-GB` es la propuesta inicial para hacer deterministas fechas y números. Es
un gate de producto: si se elige `en-US`, debe cambiarse antes de migrar copy
que incluya formatos.

El fallback de producto seguirá siendo `es`. En desarrollo y CI, una clave
ausente debe fallar de forma visible; el fallback no puede ocultar catálogos
incompletos.

### 5. Organización de mensajes

Se usarán namespaces por bounded context o superficie con ownership real:

```text
common
auth
registration
errors
```

No se creará un namespace por componente. `common` contendrá únicamente
mensajes con semántica idéntica entre consumidores.

Las claves serán semánticas y estables:

```text
auth:login.title
auth:login.submit
registration:progress
errors:studyCatalog.nodeNotFound
```

No se usarán textos fuente como ID ni se concatenarán fragmentos para formar
frases.

### 6. Recursos serializables

Las funciones actuales de los catálogos se convertirán a mensajes:

```ts
// antes
progress: ({ current, total }) => `Paso ${current} de ${total}`

// después
progress: "Paso {{current}} de {{total}}"
```

Los recursos no contendrán funciones ni elementos React. Esto permite
extracción, inspección y transferencia a tooling de traducción.

Plurales, variantes y contexto usarán las convenciones soportadas por i18next,
no condiciones duplicadas en componentes.

### 7. API de consumo

Las vistas React usarán `useTranslation` con namespace explícito:

```tsx
const { t } = useTranslation("auth")
return <Heading>{t("login.title")}</Heading>
```

Código fuera de React recibirá una función `TFunction` acotada o una función de
presentación construida por la app. No importará la instancia global.

`packages/ui` no dependerá de i18next. Sus primitives seguirán recibiendo
etiquetas accesibles mediante props.

### 8. Errores y validación

Los schemas y atoms conservarán códigos semánticos como
`validation.email.required`. La capa de presentación resolverá esos códigos
mediante un namespace de validación conocido.

Nunca se aplicará `t(error.message)` ni se mostrará el fallback técnico devuelto
por Effect, HTTP o una excepción.

Los mappers de errores públicos seguirán siendo exhaustivos. i18next cambia
únicamente la operación final que convierte una clave semántica y sus parámetros
en copy.

## Alcance por capas

```text
- contrato compartido/API HTTP: no
- persistencia y repositories backend: no
- services/casos de uso backend: no
- handlers HTTP: no
- frontend core/atoms: sí
- adapters frontend web: sí
- UI primitives: solo si el inventario descubre copy interno
- pantallas y rutas web: sí
- apps Astro y React Native: diseño y contract tests, no creación
- tests y fixtures: sí
- documentación: sí
- admin: no
```

`StudyNode.name` permanece fuera de alcance. Es contenido de dominio procedente
del backend y requiere un diseño transversal independiente.

## Estructura objetivo

```text
packages/product-messages/
├── src/
│   ├── locale.ts
│   ├── resources/
│   │   ├── es/
│   │   │   ├── common.ts
│   │   │   ├── auth.ts
│   │   │   ├── registration.ts
│   │   │   └── errors.ts
│   │   ├── en/
│   │   │   └── ...
│   │   └── index.ts
│   ├── create-i18n.ts
│   ├── types.d.ts
│   ├── index.ts
│   └── *.test.ts
└── package.json

packages/frontend-core/src/product-locale/
├── atoms.ts
├── index.ts
└── atoms.test.ts

apps/web/src/platform/product-locale/
├── locale-store.ts
├── product-i18n.web.ts
└── *.test.ts
```

La separación por archivo de cada namespace se aplicará solo si mantiene los
archivos revisables; no se crearán barrels o wrappers vacíos.

## Fase 0 — Spike y gates

### Objetivo

Eliminar incertidumbres de integración antes de migrar copy.

### Trabajo

1. Instalar temporalmente en una rama de implementación `i18next` y
   `react-i18next` con versiones fijadas por el lockfile.
2. Crear una instancia aislada con recursos embebidos y `initImmediate: false`
   o la configuración equivalente validada contra la versión instalada.
3. Verificar React 19, Vite, HMR y Strict Mode.
4. Probar dos instancias simultáneas con locales distintos para demostrar que no
   existe estado global compartido.
5. Probar cambio de locale desde `"es"` a `"en"` sin fallback visual intermedio.
6. Validar tipado de:
   - claves;
   - namespaces;
   - parámetros de interpolación;
   - plurales con `count`.
7. Construir un pequeño harness que simule una instancia por request para
   preservar la futura integración Astro.
8. Documentar si React Native necesita polyfills de APIs `Intl` para los
   formatos realmente usados. No añadirlos hasta existir la app nativa.

### Gates

- Ninguna instancia mutable se exporta como singleton desde el package.
- Dos renders concurrentes pueden usar locales distintos.
- Una clave inexistente produce error de TypeScript cuando el API de i18next lo
  permite y fallo explícito en tests/runtime de desarrollo.
- La configuración no requiere detector ni backend de i18next.
- El build no introduce Node APIs en el bundle web.

Si falla el aislamiento por request o el tipado resulta materialmente inferior
al catálogo actual, se detiene la migración y se registra la decisión antes de
modificar pantallas.

## Fase 1 — Infraestructura compartida

### Archivos principales

```text
packages/product-messages/src/catalog.ts
packages/product-messages/src/locale.ts
packages/product-messages/src/resources/*
packages/product-messages/src/create-i18n.ts
packages/product-messages/src/index.ts
packages/product-messages/package.json
```

### Trabajo

1. Extraer `Locale`, `isLocale`, fallback y tags regionales a `locale.ts`.
2. Convertir los catálogos actuales en recursos i18next por namespace.
3. Definir una factory que siempre reciba un locale inicial explícito.
4. Configurar:
   - `supportedLngs`;
   - `fallbackLng`;
   - `defaultNS`;
   - `returnNull: false`;
   - interpolación segura para React;
   - tratamiento estricto de claves ausentes en desarrollo/test.
5. Añadir module augmentation para claves y recursos tipados.
6. Mantener temporalmente `catalogFor()` mediante los recursos antiguos solo si
   es necesario para una migración incremental. No debe adaptarse i18next de
   vuelta a `MessagesCatalog`.
7. Marcar la API antigua como interna/deprecada y registrar consumidores
   restantes mediante `rg`.

### Pruebas

- todos los namespaces existen en `es` y `en`;
- cada recurso tiene la misma forma estructural;
- interpolaciones conocidas producen el copy esperado;
- plurales cubren cero, uno y varios cuando aplique;
- fallback y locale desconocido siguen la política definida;
- dos instancias no contaminan su locale;
- claves ausentes fallan bajo la configuración de test.

### Salida

El package puede resolver mensajes sin React y sin globals de plataforma.

## Fase 2 — Integración web y ownership del locale

### Archivos principales

```text
apps/web/src/main.tsx
apps/web/src/routes/router.tsx
apps/web/src/routes/navigation.ts
apps/web/src/platform/product-locale/*
packages/frontend-core/src/product-locale/*
```

### Trabajo

1. Construir la instancia web en la composition root a partir del locale inicial
   validado de la URL.
2. Añadir `I18nextProvider` en la raíz React.
3. Hacer que el layout `/:locale` coordine:
   - locale de la instancia;
   - `document.documentElement.lang`;
   - `document.documentElement.dir`.
4. Implementar el cambio de idioma como navegación tipada que conserva:
   - route ID;
   - params ajenos al locale;
   - search params;
   - hash cuando corresponda.
5. Conectar `makeProductLocaleAtoms` a la composición real o reducir esa factory
   si `messagesCatalogAtom` deja de tener consumidores.
6. Sustituir la persistencia directa actual por el mecanismo normativo basado en
   `KeyValueStore` y schema versionado.
7. Distinguir:
   - locale explícito en URL;
   - preferencia persistida;
   - locale detectado del dispositivo.
8. Evitar listeners duplicados entre router, atom e i18next.

### Invariantes

- el router es el único escritor de History;
- una URL válida gana sobre preferencia y dispositivo;
- navegar con back/forward no persiste una nueva preferencia;
- solo una selección explícita del usuario persiste;
- i18next no navega ni modifica almacenamiento;
- el componente no usa `useEffect` para derivar mensajes;
- Strict Mode no duplica suscripciones o escrituras.

### Pruebas

- arranque directo en `/en/login`;
- redirect raíz al locale preferido;
- cambio `es → en → es`;
- conservación de pantalla y search params;
- back/forward;
- almacenamiento inaccesible;
- `<html lang>` y `dir`;
- ausencia de copy del locale anterior después de la transición observable;
- aislamiento entre tests mediante una instancia nueva.

## Fase 3 — Módulo piloto `auth`

### Objetivo

Validar consumo React, formularios, validación, errores y pruebas accesibles antes
de migrar el wizard.

### Archivos principales

```text
apps/web/src/pages/auth/*
apps/web/src/modules/auth/*
apps/web/src/platform/form/context.ts
apps/web/src/platform/form/fields.tsx
```

### Trabajo

1. Migrar páginas de login y recuperación usando el namespace `auth`.
2. Reemplazar `FormMessagesProvider` y `useFormMessages`.
3. Resolver códigos de validación mediante un namespace explícito; un código
   desconocido debe mostrar un fallback seguro y registrable, no el código en
   producción.
4. Migrar estados loading, submitting, success y failure.
5. Mantener las etiquetas accesibles como valores observables.
6. Retirar del catálogo antiguo únicamente las claves sin consumidores.

### Criterios de aceptación

- todas las rutas auth renderizan español e inglés;
- formularios conservan estado cuando solo cambia el locale si esa es la
  política de producto;
- errores de validación conocidos se traducen;
- errores desconocidos no filtran texto técnico;
- los tests consultan roles y nombres accesibles, no internals de i18next.

## Fase 4 — Registro y errores de producto

### Trabajo

1. Migrar `registration` y sus estados completos.
2. Convertir `progress` en interpolación i18next.
3. Introducir pluralización solo donde exista semántica plural real.
4. Migrar mappers de errores de `study-catalog` para devolver claves y
   parámetros semánticos o resolver mediante una función acotada.
5. Confirmar que el cambio de idioma conserva el path del wizard.
6. Revisar loading, empty, retry, complete y navegación accesible.
7. Inventariar strings españolas restantes en las superficies alcanzables.

### Criterios de aceptación

- wizard completo disponible en ambos idiomas;
- ninguna decisión de dominio compara copy localizado;
- `StudyNode.name` permanece explícitamente sin traducir;
- no quedan imports del catálogo antiguo en superficies migradas.

## Fase 5 — Limpieza del sistema anterior

### Trabajo

1. Eliminar `MessagesCatalog`, `catalogs`, `catalogFor()` y funciones de mensaje.
2. Eliminar `messagesCatalogAtom`.
3. Eliminar `FormMessagesProvider` y `useFormMessages`.
4. Retirar compatibilidad temporal y dependencias ya innecesarias.
5. Ejecutar Knip y dependency-cruiser para detectar exports o límites muertos.
6. Actualizar:
   - `docs/proposals/product-internationalization.md`;
   - `docs/webapp-architecture.md`;
   - `docs/architecture/client-platform-ports-and-adapters.md`;
   - documentación de testing si cambia el harness.

### Gate de retirada

La API anterior solo se elimina cuando:

- `rg` no encuentra consumidores;
- auth y registro pasan en ambos locales;
- build web pasa;
- existe prueba de composición de la instancia;
- la documentación describe únicamente el ownership nuevo.

## Fase 6 — Preparación para Astro

Esta fase documenta y prueba contratos; no crea `apps/astro`.

### Contrato esperado

- una instancia i18next nueva por request o build context;
- locale procedente de `Astro.currentLocale`;
- routing y fallback de páginas propiedad de `astro:i18n`;
- `getFixedT(locale, namespace)` para render fuera de React;
- una isla recibe el locale o su provider aislado, nunca una instancia global;
- los recursos no contienen funciones y pueden cruzar límites de serialización;
- metadata, canonical y `hreflang` no pertenecen a i18next.

### Prueba de preparación

Un test de aislamiento creará dos contextos equivalentes a requests concurrentes
en `es` y `en` y comprobará resultados distintos sin mutación cruzada.

## Fase 7 — Preparación para React Native

Esta fase tampoco crea una app nativa.

### Contrato esperado

- `react-i18next` puede reutilizar los mismos namespaces;
- el locale del dispositivo llega mediante un adapter Expo/native;
- la preferencia usa `KeyValueStore` con backing store nativo;
- navegación y deep links pertenecen al router nativo;
- no existen imports de `window`, `document`, `navigator` o `localStorage` en
  packages compartidos;
- formatos `Intl` declaran sus requisitos y polyfills solo si el runtime objetivo
  los necesita.

## Estrategia de compatibilidad

La migración será por consumidor, no mediante un flag global.

Durante las fases 1–4 podrán coexistir:

```text
catálogo anterior → superficies todavía no migradas
i18next          → superficies migradas
```

Ambos deben recibir el mismo locale desde la route. No se mantendrá esta
coexistencia después de la fase 5.

No se construirá un wrapper permanente que replique `MessagesCatalog` encima de
i18next. Eso conservaría dos abstracciones y ocultaría las capacidades por las
que se adopta la librería.

## Testing

### Unitario

- normalización y validación de locale;
- recursos y namespaces completos;
- interpolación y pluralización;
- instancia aislada;
- configuración de missing keys;
- atoms de selección con adapter en memoria.

### Integración React

- provider real por test;
- render en ambos idiomas;
- cambio de idioma por evento observable;
- validación de formularios;
- foco y nombres accesibles;
- Strict Mode.

### Routing y plataforma

- locale inicial y redirects;
- navegación conservando estado de URL;
- persistencia versionada;
- back/forward;
- `lang`/`dir`;
- fallos de almacenamiento.

### Prohibiciones de test

- no snapshots masivos de catálogos;
- no singleton compartido entre tests;
- no assertions sobre internals del provider;
- no mocks de `t` que permitan claves inexistentes;
- no considerar un build como prueba suficiente del cambio de idioma.

## Validación prevista

Por fase:

```bash
pnpm --filter @proxus/product-messages typecheck
pnpm --filter @proxus/product-messages test
pnpm --filter @proxus/frontend-core typecheck
pnpm --filter @proxus/frontend-core test
pnpm --filter @proxus/web typecheck
pnpm --filter @proxus/web test
pnpm --filter @proxus/web build
```

Antes de retirar el sistema anterior:

```bash
pnpm validate:self-test
pnpm static
pnpm test
pnpm build
```

Si el cambio toca APIs Effect o configuración de sus proyectos TypeScript, se
ejecutará también:

```bash
pnpm effect:diagnostics
```

La implementación deberá informar qué comandos se ejecutaron y cuáles quedaron
pendientes.

## Riesgos y mitigaciones

### Dos fuentes de verdad

**Riesgo:** router, atom e i18next divergen.

**Mitigación:** flujo unidireccional desde navegación validada; i18next nunca
escribe router o persistencia.

### Contaminación SSR

**Riesgo:** una instancia global sirve el locale de otra petición.

**Mitigación:** factory e instancia por request; contract test concurrente antes
de añadir Astro.

### Fallback que oculta traducciones

**Riesgo:** inglés incompleto parece correcto porque muestra español.

**Mitigación:** validación estructural, handler de missing keys estricto y tests
de completitud.

### Pérdida de tipado

**Riesgo:** claves o parámetros vuelven a ser strings arbitrarios.

**Mitigación:** module augmentation, namespaces explícitos, pruebas negativas de
tipos donde sea viable y prohibición de casts para silenciar claves.

### Migración duplicada

**Riesgo:** mantener catálogo e i18next indefinidamente.

**Mitigación:** inventario de consumidores, gate de retirada y ausencia de
wrapper permanente.

### Bundle y arranque

**Riesgo:** incluir runtime y todos los recursos sin beneficio medible.

**Mitigación:** medir bundle antes/después. No añadir backend HTTP ni lazy
loading hasta que tamaño y número de locales lo justifiquen.

### React Native e `Intl`

**Riesgo:** un formato funciona en navegador y no en el runtime nativo elegido.

**Mitigación:** declarar requisitos por formato y validar el runtime real antes
de añadir polyfills.

## Decisiones cerradas durante la implementación

1. Los tags de formato son `es-ES` y `en-GB`.
2. El futuro selector reemplazará el locale de la ruta sin crear una entrada de
   historial adicional.
3. La preferencia permanece local al dispositivo mientras no exista una
   decisión de producto sobre sincronización con cuenta.
4. No se adopta un TMS en esta migración; los recursos quedan preparados para
   integrarlo posteriormente.
5. Cambiar de locale conserva el estado de formularios parcialmente editados.
6. Admin continúa fuera de alcance y se mantiene únicamente en español. No
   carga i18next, no expone selector de idioma y no condiciona la completitud de
   los catálogos de producto.

## Definición de terminado

- `apps/web` usa i18next para todo el copy de auth y registro.
- `Locale` sigue validado en `/:locale`.
- Effect Atom y router conservan ownership de estado y navegación.
- no existen `MessagesCatalog`, `catalogFor()` ni `messagesCatalogAtom`.
- no hay singletons mutables compartidos desde packages.
- recursos españoles e ingleses son completos y tipados.
- interpolaciones y plurales usan el motor, no funciones de catálogo.
- errores públicos y validaciones se localizan desde códigos semánticos.
- `packages/ui` sigue independiente del runtime.
- la preparación para Astro demuestra aislamiento por request.
- los límites compartidos no importan APIs web y quedan preparados para un
  adapter nativo real.
- documentación, tests, static checks y build quedan actualizados y pasan.
