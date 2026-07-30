# Ports y adapters de plataforma cliente

> **Estado:** normativa de arquitectura frontend  
> **Alcance:** `apps/web`, `apps/admin` y futuros clientes React Native

## Regla central

La lógica frontend compartida depende de ports de capacidad neutrales. Las APIs del navegador, React Native, Expo y SDKs de proveedor solo aparecen en adapters elegidos por la composition root de cada aplicación.

```text
screen/component
  → feature atom
    → application client → transport
    → platform port ← web adapter | native adapter | test adapter
```

Las diferencias exclusivamente visuales pertenecen a las vistas específicas de cada app. No justifican un port.

### Cliente HTTP público

`frontend-core` expone el servicio `PublicApiClient` y los módulos de producto
dependen de ese servicio, no de `HttpClient` ni de una URL concreta. Cada
composition root construye su Layer con `makePublicApiClientLayer(baseUrl)` y
proporciona el transporte de su plataforma.

Web selecciona la URL relativa `/api` y un `FetchHttpClient` con cookies. Admin
selecciona de forma independiente el mismo cliente público para sus lecturas.
Un cliente React Native seleccionará una URL absoluta y su política de
autenticación/transporte sin modificar los atoms compartidos. `frontend-core`
no contiene origins, URLs relativas ni configuración de cookies o tokens.

## Dirección de dependencias

```text
app UI → frontend-core port ← platform adapter
   app composition root → factory de atoms + adapter
```

- `frontend-core` contiene reglas, transiciones, view models, ports y factories de atoms.
- Un adapter puede depender del port; el port nunca depende del adapter.
- Las apps seleccionan adapters y construyen los atoms públicos del feature.
- Los módulos de feature no importan `window`, `document`, `navigator`, almacenamiento del navegador, `react-native`, Expo ni SDKs concretos.
- No se crean ports para funciones puras ni por sustitución hipotética.

## Diseño y ubicación

Un port representa una capacidad cohesiva en lenguaje de aplicación. No se permite un `PlatformService` genérico.

```text
packages/frontend-core/src/<module>/
  model.ts
  transitions.ts
  atoms.ts              # factory que recibe ports
  testing.ts            # adapters en memoria

apps/web/src/platform/<module>/
  *.web.ts              # URL, browser storage, host APIs

apps/<native>/src/platform/
  *.native.ts           # React Native / Expo
```

Los adapters compartidos se extraen solo cuando tienen consumidores reales. Deben usar sufijos o exports que hagan explícita la plataforma.

## Atom port o servicio Effect

Usar un **port/factory de Atom** cuando la capacidad es principalmente estado reactivo legible y escribible: preferencias, conectividad o estado local persistido.

Usar un **servicio Effect con Layer** cuando hay operaciones asíncronas, fallos tipados, permisos, recursos, cancelación o lifecycle: API, almacenamiento seguro, cámara, archivos, notificaciones o uploads.

Cuando hay ambas necesidades, el servicio ejecuta las operaciones y los atoms modelan su estado y transiciones.

### Router SPA

`@proxus/effect-router` es el único propietario de URL e History en `apps/web`.
Sus rutas seleccionan layouts y páginas, pero no usan loaders, caché de datos ni
invalidación. La ubicación fuente vive en un atom serializable y los matches se
derivan. React despacha la única `navigateAction`; los workflows Effect usan la
misma operación tipada del router sin duplicar la ubicación.

Los parámetros y search params son detalles de la aplicación web. Sus codecs
pueden usar Effect Schema, mientras los conceptos de producto que representan
permanecen en `frontend-core`.

Una navegación externa que abandona la SPA —por ejemplo OAuth— no acepta un ID del contrato y no pertenece a `Router.navigate`. Usa el servicio Effect `DocumentNavigation`, cuyo adapter web encapsula `window.location.assign` y transforma los fallos del host en `DocumentNavigationError`.

El almacenamiento key/value ordinario usa `effect/unstable/persistence/KeyValueStore`; cada aplicación proporciona mediante un Layer el backing store web, nativo o de test. No se crean ports que repitan `get`, `set` y `remove`. El acceso debe tratarse como una capacidad que puede fallar incluso al leer `window.localStorage`. Una identidad funcional puede degradar a una única identidad en memoria estable durante el lifecycle del adapter; analytics y cualquier capacidad condicionada por consentimiento deben fallar cerradas si no pueden leer o escribir el estado requerido. Los valores persistidos se validan y codifican con `KeyValueStore.toSchemaStore`, no con assertions sobre strings recuperados.

## Ejemplo normativo: path de registro

`frontend-core` define las transiciones del registro y recibe una operación de
navegación. Web codifica el paso y el path en search params del Effect router:

```ts
export interface RegistrationPathNavigation<E> {
  readonly registrationPathAtom: Atom.Atom<RegistrationPath>
  readonly replaceRegistrationPath: (
    path: RegistrationPath,
    get: Atom.FnContext,
  ) => Effect.Effect<void, E>
}
```

`RegistrationPathParam` valida la representación textual. El adapter web
conserva los valores de query ajenos al wizard y es el único escritor de
History.

El locale es siempre el primer segmento (`/:locale/...`). El layout lo valida
con `Locale`, proporciona el catálogo de mensajes y actualiza los atributos del
documento.

## Composition roots

Cada aplicación debe:

1. elegir sus adapters;
2. configurar URL de API y transporte;
3. construir los atoms/families del feature;
4. exponer una interfaz local estable a sus vistas.

Las vistas solo leen atoms y despachan eventos. No seleccionan plataforma ni construyen Layers/adapters.

## Testing

- Las factories de atoms se prueban con un adapter nuevo en memoria por test.
- Los tests de feature mockean el port o servicio, no globals ni SDKs.
- Cada adapter live tiene tests focalizados de serialización, errores, suscripciones y cleanup.
- Debe existir una pequeña prueba de composición por plataforma.
- Los contract tests se reutilizan entre adapters cuando prometen el mismo comportamiento.

## Checklist de revisión

- ¿Existe variación real de plataforma, lifecycle, fallo o ventaja de test?
- ¿La regla de producto permanece en `frontend-core`?
- ¿El port usa tipos de aplicación y evita tipos DOM/native/vendor?
- ¿La app selecciona el adapter cerca de su composition root?
- ¿La vista evita globals, SDKs y condicionales de plataforma?
- ¿Existe adapter de test aislado?
- ¿Persistencia, permisos, interrupción y cleanup están modelados explícitamente?
