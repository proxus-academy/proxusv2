# Ports y adapters de plataforma cliente

> **Estado:** normativa de arquitectura frontend  
> **Alcance:** `apps/web`, `apps/mobile-web`, `apps/admin` y futuros clientes React Native

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

packages/frontend-web/src/<module>/
  *.web.ts              # URL, browser storage, host APIs

apps/<native>/src/platform/
  *.native.ts           # React Native / Expo
```

Los adapters compartidos se extraen solo cuando tienen consumidores reales. Deben usar sufijos o exports que hagan explícita la plataforma.

## Atom port o servicio Effect

Usar un **port/factory de Atom** cuando la capacidad es principalmente estado reactivo legible y escribible: URL, navegación, preferencias, conectividad o estado local persistido.

Usar un **servicio Effect con Layer** cuando hay operaciones asíncronas, fallos tipados, permisos, recursos, cancelación o lifecycle: API, almacenamiento seguro, cámara, archivos, notificaciones o uploads.

Cuando hay ambas necesidades, el servicio ejecuta las operaciones y los atoms modelan su estado y transiciones.

## Ejemplo normativo: path de registro

`frontend-core` define las transiciones y recibe un atom escribible:

```ts
export type RegistrationPathAtom = Atom.Writable<
  RegistrationPath,
  RegistrationPath
>

export const makeRegistrationAtoms = (
  registrationPathAtom: RegistrationPathAtom,
) => ({
  // queries y operaciones nombradas construidas sobre el port
})
```

Web compone la factory con `makeWebRegistrationPathAtom()`, que sincroniza `?path=`. Un cliente React Native podrá proporcionar un atom respaldado por router, memoria o AsyncStorage sin cambiar las reglas ni las pantallas consumidoras.

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
