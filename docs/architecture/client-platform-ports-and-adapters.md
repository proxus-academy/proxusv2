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

Usar un **port/factory de Atom** cuando la capacidad es principalmente estado reactivo legible y escribible: URL, navegación, preferencias, conectividad o estado local persistido.

Usar un **servicio Effect con Layer** cuando hay operaciones asíncronas, fallos tipados, permisos, recursos, cancelación o lifecycle: API, almacenamiento seguro, cámara, archivos, notificaciones o uploads.

Cuando hay ambas necesidades, el servicio ejecuta las operaciones y los atoms modelan su estado y transiciones.

### Router tipado

El router es un servicio Effect proporcionado por Layer. Los workflows obtienen el servicio con `yield* Router` y ejecutan directamente `yield* router.navigate(...)` o `yield* router.replace(...)`; no se exporta una action distinta por cada destino. React puede usar un único binding que delega en ese servicio, pero nombres como `navigateToLoginAction` o `navigateToHomeAction` están prohibidos.

Cada ruta terminal separa explícitamente sus entradas:

- `path`: parámetros que se codifican en el pathname;
- `query`: estado de URL declarado mediante un Schema y codificado en la query;
- parámetros contextuales heredados, como `locale`, que el router conserva sin exigirlos en cada llamada.

```ts
const router = yield* Router

yield* router.navigate("password-recovery-code")
yield* router.navigate("study-search", {
  path: { studyId },
  query: { page: 2 },
})
yield* router.replace("login")
```

El segundo argumento es obligatorio si la ruta tiene algún path param o query field obligatorio. Si toda la entrada es opcional, también lo es el argumento. La aplicación trabaja con los tipos decodificados —por ejemplo `page: number`— y el codec se ocupa de su representación textual. `pushDestination` y `replaceDestination` son escapes de bajo nivel reservados para canonicalizadores que deben editar o preservar una query ya codificada; las features y vistas no los usan para navegación ordinaria.

Una navegación externa que abandona la SPA —por ejemplo OAuth— no acepta un ID del contrato y no pertenece a `Router.navigate`. Usa el servicio Effect `DocumentNavigation`, cuyo adapter web encapsula `window.location.assign` y transforma los fallos del host en `DocumentNavigationError`.

Los adapters de almacenamiento web deben tratar el acceso como una capacidad que puede fallar incluso al leer `window.localStorage`. Una identidad funcional puede degradar a una única identidad en memoria estable durante el lifecycle del adapter; analytics y cualquier capacidad condicionada por consentimiento deben fallar cerradas si no pueden leer o escribir el estado requerido. Los valores persistidos se validan y codifican con `Schema`, no con assertions sobre strings recuperados.

## Ejemplo normativo: path de registro

El estado navegable del registro forma parte del destino tipado del router. `frontend-core` define las transiciones y recibe una lectura junto a la operación Effect que confirma el reemplazo:

```ts
export interface RegistrationPathNavigation<E> {
  readonly registrationPathAtom: Atom.Atom<RegistrationPath>
  readonly replaceRegistrationPath: (
    path: RegistrationPath,
    get: Atom.FnContext,
  ) => Effect.Effect<void, E>
}
```

Web proyecta la lectura desde el destino actual y ejecuta la escritura mediante el escape `Router.replaceDestination`, porque esta canonicalización incremental debe preservar query values ajenos al registro; no existe un segundo adapter que escriba History ni un fiber fire-and-forget. `RegistrationPathParam` acepta solo los prefijos publicados `[]`, país, país→tipo, →universidad, →grado y →asignatura. Un lifecycle scoped elimina `path` cuando su valor no cumple ese Schema, tanto al inicio como tras `popstate`, preservando el resto de la query y aplicando solo la canonicalización más reciente. Seleccionar, volver, reiniciar y canonicalizar son atoms Effect nombrados. La composition root les inyecta el único runner de comandos de navegación: conserva el último comando fallido como Effect reejecutable y expone `failedAtom`/`retryAtom`, sin que la app inspeccione ni correlacione los `AsyncResult`. Un token impide que el éxito tardío de otro comando elimine un fallo más reciente. Los hitos analíticos de una selección se ejecutan únicamente después de que `replace` confirme el nuevo path. Un cliente React Native puede proporcionar una operación respaldada por navegación nativa o memoria sin cambiar las reglas ni las pantallas consumidoras.

El locale es siempre el primer segmento (`/:locale/...`) y usa el codec `Locale` del árbol compilado. La canonicalización prioriza el path explícito, después el parámetro legado `lang`, y finalmente preferencia/dispositivo; elimina solo `lang` y conserva el resto de query y el hash. Persistencia y atributos de `document` se actualizan después de un `Router.replaceDestination` exitoso. El locale tampoco mantiene un escritor URL independiente.

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
