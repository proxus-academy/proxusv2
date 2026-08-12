# Ownership del frontend web

## Estado

Resumen operativo. La normativa completa está en [`atom-first-frontend.md`](atom-first-frontend.md).

## Flujo

```text
route → identidad estable → módulo de feature → atoms → UI
```

- `frontend-core` posee schemas, transitions, forms y atoms React-neutral.
- `apps/web/src/platform` posee adapters de browser y bindings React web.
- `packages/ui` posee primitives y patterns sin conocimiento del producto.
- `apps/*` poseen routes, pages y composición específica del cliente.

## React y atoms

- Las routes validan URL y entregan IDs o keys estables.
- Las pages componen superficies; no leen todo el estado para repartirlo por props.
- Los módulos conectados reciben identidad y derivan localmente los atoms de su feature.
- Los módulos visuales reciben datos y eventos normales.
- No se pasan atoms como props.
- `Atom.family` aísla estado por entidad o instancia.
- React Context se reserva para metadata estructural privada de compounds.
- Ningún módulo de producto importa el composition root como locator.

## Forms

Los builders neutrales viven en `frontend-core`. Web crea la instancia con
`FormReact.make`, usa `Initialize` para defaults y envía desde un `<form>` HTML
mediante el atom `submit`.

## Routing

TanStack Router es el único owner de URL e History. El árbol tipado selecciona
páginas y layouts sin `loader` ni `beforeLoad`; TanStack mantiene la ubicación y
los matches sin copiarlos a otro store. Las páginas usan Effect Atom para datos,
mutaciones y formularios. Los módulos de feature no leen ni escriben
`window.history`: los workflows navegan mediante el adapter Effect de
las APIs tipadas de TanStack Router desde las rutas React.

## Revisión

Toda implementación debe superar el checklist y los límites de imports definidos en [`atom-first-frontend.md`](atom-first-frontend.md).
