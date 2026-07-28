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

Las forms neutrales viven en `frontend-core` y se crean con `Form.make`. Web las enlaza con `FormReact.make(form, { fields })`. `Provider` inicializa, `Form` posee el submit HTML, `Submit` observa waiting y `KeepAlive` conserva estado cuando el workflow lo requiere.

## Routing

El router tipado es el único owner de URL e History. Una route entrega identidades branded a la page. Los módulos de feature usan comandos de navegación tipados; no leen ni escriben `window.history`.

## Revisión

Toda implementación debe superar el checklist y los límites de imports definidos en [`atom-first-frontend.md`](atom-first-frontend.md).
