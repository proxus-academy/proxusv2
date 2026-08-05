# Experimento frontend Model–Update–View

## Estado

Experimental y limitado a `apps/web-fsm`. No sustituye todavía la arquitectura
normativa atom-first de `apps/web` y `apps/admin`.

## Hipótesis

`web-fsm` evalúa una única máquina lógica de aplicación compuesta por submodelos:

```text
AppModel + AppMessage → update puro → AppModel + Command[]
                                      ↓
                              intérprete Effect
                                      ↓
                                  AppMessage
```

Effect Atom publica el snapshot y ofrece el único dispatcher a React. Los atoms
derivados futuros son proyecciones de lectura; no pueden convertirse en owners
alternativos. React solo renderiza `AppModel` y emite `AppMessage`.

`AppView` recibe `model` y `send` explícitamente. Esto mantiene la vista aislada
del registry y permite que una story sea solamente un modelo construido y pasado
a `<AppView model={model} send={fn()} />`. `ConnectedApp` es el único binding con
Effect Atom y el composition root es el único que monta `RegistryProvider`.

La URL es una entrada no confiable. Se parsea a `AppRoute`, entra como mensaje y
la máquina la reconcilia antes de producir una vista. La ruta canónica se deriva
del modelo y las correcciones usan `replaceState`. History y localStorage son
adapters de comandos, no fuentes de mutación directa del modelo.

El formulario de registro pertenece completamente al submodelo: valores,
campos visitados, errores y estado de envío. No usa Effect Form. El servidor y
la persistencia siguen siendo autoridades externas; la máquina representa lo
que conoce de ellos y los comandos devuelven resultados como mensajes.

## Criterios antes de promoverlo

- cola serial de mensajes con política explícita para comandos concurrentes;
- cancelación e identidad de respuestas obsoletas;
- codecs de rutas bidireccionales basados en Schema;
- subscriptions Effect scoped en vez de bindings React ad hoc;
- política de caché, freshness e invalidación;
- forms con validación async, arrays y errores de servidor;
- tests de runtime, History, storage y navegación real;
- decisión ADR que reemplace o mantenga la norma atom-first existente.

La posible evolución hacia una máquina jerárquica, con ownership de mensajes,
updates locales y regiones paralelas, se describe en
[`hierarchical-frontend-machine.md`](./hierarchical-frontend-machine.md).
