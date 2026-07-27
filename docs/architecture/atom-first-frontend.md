# Arquitectura frontend atom-first

## Estado

Normativa para `apps/web`, `apps/mobile-web`, `apps/admin` y futuros clientes React de Proxus.

Este documento define cómo se organiza el frontend alrededor de Effect Atom. Debe leerse junto con:

- [`../effect/90_react_and_effect_atom.md`](../effect/90_react_and_effect_atom.md), para runtime, queries, mutaciones y testing;
- [`../webapp-architecture.md`](../webapp-architecture.md), para render, eventos y sincronización React;
- [`client-platform-ports-and-adapters.md`](client-platform-ports-and-adapters.md), para capacidades de plataforma;
- [`../forms/24_proxus_conventions.md`](../forms/24_proxus_conventions.md), para formularios.

## Principio central

El frontend de Proxus es **atom-first**:

```text
route → identidad estable → módulo de feature → atoms → UI
```

Los atoms son la interfaz reactiva del estado y comportamiento de aplicación. React renderiza esa interfaz y despacha eventos. No se concentra todo el estado en una página para repartirlo después mediante props.

Cada aplicación monta un solo `RegistryProvider`. El `AtomRegistry` funciona como contexto reactivo de aplicación. La identidad de cada entidad o instancia se representa mediante `Atom.family`; no se añaden React Contexts que dupliquen estado ya poseído por atoms.

## Clasificación obligatoria de módulos React

### Route module

Responsabilidades:

- decodificar y validar identidad procedente de la URL;
- seleccionar la página terminal y sus layouts;
- entregar IDs, keys o parámetros pequeños y estables;
- representar not-found y errores de routing.

Una route no consulta datos de producto, no crea Layers y no contiene la implementación visual de una página.

```tsx
function StudyNodeRoute() {
  const nodeId = useNodeIdParam()
  return <StudyNodePage nodeId={nodeId} />
}
```

### Page module

Una page es el punto de composición de una superficie navegable. Decide qué módulos de feature y patterns forman la pantalla, pero no centraliza todos sus atoms ni distribuye un view model gigante.

```tsx
function StudyNodePage({ nodeId }: { readonly nodeId: StudyNodeId }) {
  return (
    <Page.Root>
      <StudyNodeHeader nodeId={nodeId} />
      <StudyNodeEditor nodeId={nodeId} />
      <RelationExplorer nodeId={nodeId} />
    </Page.Root>
  )
}
```

Una page puede consultar el mínimo estado necesario para decidir entre estados completos de página, por ejemplo autorización o identidad no encontrada. Los módulos descendientes consultan localmente el resto.

### Feature module conectado

Un módulo conectado pertenece a un bounded context, recibe identidad estable y deriva sus atoms en el punto de uso.

```tsx
function RelationExplorer({ nodeId }: { readonly nodeId: StudyNodeId }) {
  const relations = useAtomValue(outgoingRelationsFamily(nodeId))
  const filter = useAtomValue(relationFilterFamily(nodeId))
  const setFilter = useAtomSet(relationFilterFamily(nodeId))
  // Render explícito de AsyncResult y composición de UI de feature.
}
```

Puede conocer atoms de su propia feature. No importa el composition root, no construye Layers y no accede a globals de plataforma.

### Módulo visual

Un módulo visual renderiza datos ya disponibles y emite eventos. Recibe props normales y no conoce atoms de producto.

```tsx
function RelationRow(props: {
  readonly relation: NodeRelation
  readonly onSelect: () => void
}) {
  return <button onClick={props.onSelect}>{props.relation.node.name}</button>
}
```

Los primitives de `@proxus/ui`, patterns compartidos y módulos que deban reutilizarse en Storybook pertenecen a esta categoría.

### Composition root

El composition root:

- proporciona Layers y adapters a runtimes estables;
- ensambla routing, HTTP y capacidades de plataforma;
- configura valores iniciales del registry;
- no actúa como locator global de atoms de producto;
- no contiene decisiones visuales ni workflows.

## Ownership del estado

| Estado o dato | Propietario obligatorio |
| --- | --- |
| Query remota y su `AsyncResult` | Query atom |
| Mutación remota | Function atom |
| Workflow o máquina de producto | Atom o conjunto cohesivo de atoms |
| Draft persistente | Atom respaldado por port de storage |
| Formulario | Form neutral creada con `Form.make` |
| Derivación compartida | `Atom.readable` o atom derivado |
| Estado por entidad/instancia | `Atom.family` |
| Estado aislado por subtree sin identidad natural | `ScopedAtom`, excepcionalmente |
| Identidad (`nodeId`, `userId`, route key) | Prop estable |
| Configuración visual | Props o variantes explícitas |
| Estado visual efímero | Estado React local |
| Metadata estructural de un compound | React Context privado |

## Identidad antes que prop drilling

Las props transportan IDs, keys y configuración pequeña y estable:

```tsx
<NodeEditor nodeId={nodeId} />
<RelationList nodeId={nodeId} direction="outgoing" />
```

El receptor deriva los atoms correspondientes:

```tsx
const node = useAtomValue(nodeFamily(nodeId))
const rename = useAtomSet(renameNodeFamily(nodeId))
```

No se pasan por varios niveles datos remotos ya resueltos cuando el consumidor puede derivarlos desde la identidad.

### Prohibido: prop drilling de estado de aplicación

```tsx
<NodePage
  node={node}
  relations={relations}
  mutation={mutation}
  onRename={rename}
  onConnect={connect}
/>
```

### Prohibido: atoms como props

```tsx
<NodeEditor nodeAtom={nodeFamily(nodeId)} />
```

Pasar un atom como prop expone la implementación reactiva y dificulta reconocer la identidad. Se pasa `nodeId`; el módulo selecciona la family.

## `Atom.family` como aislamiento de instancia

Todo atom cuya identidad dependa de input usa `Atom.family`.

```ts
export const nodeEditorFamily = Atom.family((nodeId: StudyNodeId) =>
  Atom.make(initialEditorState(nodeId)),
)
```

Una key compuesta incluye todas las dimensiones necesarias para impedir fugas:

```ts
class RelationListKey extends Data.Class<{
  readonly nodeId: StudyNodeId
  readonly direction: "incoming" | "outgoing"
}> {
  static make(input: RelationListKey) {
    return new RelationListKey(input)
  }
}
```

Reglas:

1. usar IDs de dominio branded cuando existan;
2. incluir entidad, modo y scope que cambien el estado;
3. usar `Data.Class` para keys compuestas con igualdad estructural;
4. no envolver la llamada a una family en `useMemo`;
5. aplicar TTL o auto-dispose según el lifecycle real;
6. no usar un atom singleton llamado `currentX` si pueden coexistir dos instancias.

## Atoms frente a React Context

Effect Atom cubre el estado reactivo compartido:

```text
identidad del atom + AtomRegistry actual → valor actual
```

React Context se reserva para metadata estructural privada que depende del subtree:

- asociación DOM mediante `formId`;
- ownership y validación de compounds;
- refs imperativas;
- slots o configuración estructural de una instancia visual;
- integración con una primitive de terceros.

Un Context no duplica values, loading, errors, actions o datos que ya viven en atoms.

Si una instancia no tiene identidad natural y debe aislarse por subtree, se considera `ScopedAtom` antes de crear un almacén paralelo con `useState` y Context.

## Composición de módulos complejos

Los compounds son apropiados cuando una familia visual tiene piezas combinables y estado compartido. Su estado puede estar respaldado por atoms; el contexto privado solo resuelve ownership o metadata estructural.

```tsx
<NodeEditor.Provider nodeId={nodeId}>
  <NodeEditor.Frame>
    <NodeEditor.Name />
    <NodeEditor.Status />
    <NodeEditor.Relations />
    <NodeEditor.Actions />
  </NodeEditor.Frame>
</NodeEditor.Provider>
```

Reglas de composición:

- evitar props booleanas que activen fragmentos internos;
- preferir variantes explícitas o children;
- no usar `renderHeader`, `renderFooter` o `renderActions` cuando children expresan la estructura;
- el provider es el único módulo que conoce cómo se obtiene el estado compartido;
- no crear compounds para primitives triviales o para ocultar una única llamada a un atom.

## AsyncResult

`AsyncResult` cruza intacto hasta el módulo que posee la decisión visual correspondiente. No se transforma loading o failure en datos vacíos.

```tsx
function RelationExplorer({ nodeId }: Props) {
  const result = useAtomValue(outgoingRelationsFamily(nodeId))

  return AsyncResult.matchWithError(result, {
    onInitial: () => <RelationList.Loading />,
    onError: ({ error }) => <RelationList.Error error={error} />,
    onDefect: ({ defect }) => <RelationList.Defect defect={defect} />,
    onSuccess: ({ value }) => value.length === 0
      ? <RelationList.Empty />
      : <RelationList relations={value} />,
  })
}
```

Los estados loading, refreshing, failure, empty y success son decisiones diferentes. Los módulos visuales reutilizables pueden representar esos estados, pero no deciden qué atom consultar.

## Estructura de filesystem

Los bounded contexts mantienen el mismo nombre entre las capas que participan. Los atoms de producto son neutrales y viven por defecto en `frontend-core`, no en cada aplicación:

```text
packages/frontend-core/src/<feature>/
├── queries.ts
├── mutations.ts
├── state.ts
├── forms.ts
├── model.ts
├── internal/
└── index.ts

packages/frontend-web/src/<feature>/
├── <browser-adapter>.web.ts
├── <react-web-binding>.tsx
├── internal/
└── index.ts

apps/<client>/src/
├── routes/
├── pages/
├── modules/
│   └── <feature>/
│       ├── components/
│       ├── internal/
│       └── index.ts
├── patterns/
├── composition/
└── main.tsx
```

Un atom pertenece obligatoriamente a `frontend-core` cuando representa estado remoto, estado de producto, un workflow, una mutación, una form neutral o una derivación reutilizable en web, mobile-web, admin o el futuro cliente React Native. Las aplicaciones no duplican esos atoms para adaptar la presentación.

Un atom puede permanecer en una aplicación solo si representa estado exclusivo de esa aplicación, sin significado de producto ni posibilidad razonable de reutilización. Esta excepción debe documentar por qué no pertenece al bounded context neutral. El estado puramente visual sigue siendo estado React local, no un atom de aplicación.

No se crean directorios vacíos para satisfacer simetría. Una feature pequeña puede mantener archivos en su raíz. Se divide cuando existe una responsabilidad estable, no por alcanzar un número arbitrario de líneas.

### Entry points

Cada feature expone una interface explícita desde el entry point de su capa. Desde fuera están prohibidos los imports profundos:

```ts
// Correcto: estado y comportamiento neutral
import { nodeFamily, renameNodeFamily } from "@proxus/frontend-core/study-catalog"

// Correcto: composición React específica de la aplicación
import { StudyNodeEditor } from "@/modules/study-catalog"

// Incorrecto
import { nodeFamily } from "@proxus/frontend-core/src/study-catalog/queries"
```

Los archivos internos de una feature sí pueden usar imports relativos entre sí.

## Límites entre packages y aplicaciones

### `packages/frontend-core`

Es el owner por defecto del estado y comportamiento frontend:

- schemas y modelos React-neutral;
- query, mutation, workflow, state y derived atoms de producto;
- `Atom.family` y sus keys de identidad;
- transitions compartibles entre plataformas;
- forms neutrales;
- interfaces de ports de plataforma;
- contratos de routing.

No importa React, DOM ni adapters web. Sus atoms consumen clientes HTTP tipados o ports neutrales proporcionados por el runtime, de modo que web y React Native reutilizan exactamente las mismas definiciones.

### `packages/frontend-web`

Posee:

- adapters de browser;
- integración React web reutilizable;
- bindings web de formularios;
- patterns web compartidos solo cuando existan al menos dos consumidores reales.

No contiene decisiones específicas de una aplicación.

### `packages/ui`

Posee primitives y patterns visuales sin conocimiento del dominio de producto. No importa atoms de auth, registration, catálogo o administración.

### `apps/*`

Poseen routes, pages, composition roots y UI específica de cada cliente. Consumen los atoms de `frontend-core` directamente en los módulos de feature. Una presentación diferente no justifica duplicar atoms, forms o workflows neutrales. Los atoms locales de aplicación son una excepción para comportamiento realmente exclusivo y deben justificar su ownership.

## Imports y dependencias prohibidas

1. Ningún módulo React salvo el composition root importa o crea Layers.
2. Ningún módulo de feature importa `composition.ts` como locator.
3. Ningún módulo visual importa atoms de producto.
4. Ninguna route importa queries o mutaciones para construir datos.
5. Ningún atom accede directamente a `window`, `document`, storage o SDKs.
6. Ningún módulo pasa atoms como props.
7. Ningún cliente recrea primitives equivalentes a `@proxus/ui` sin una decisión documentada.
8. Ninguna feature importa internals de otra feature; usa su entry point.
9. Ningún componente ejecuta `Effect.runPromise`.
10. Ningún fetch remoto se inicia desde `useEffect`.

## Estado React local permitido

`useState` es válido para estado visual sin significado de aplicación:

- apertura de un popover no controlado;
- hover o focus no cubiertos por CSS/primitives;
- medida DOM efímera;
- selección temporal interna de un dialog que se descarta al cerrarlo.

Se eleva a atom cuando necesita persistencia, asincronía, coordinación entre módulos, URL, tests sin React o continuidad tras desmontaje.

## Testing

### Atoms

- probar con `AtomRegistry`;
- proporcionar Layers de test mediante valores iniciales del runtime;
- no mockear definiciones de atoms;
- comprobar aislamiento entre keys de families;
- comprobar `AsyncResult`, invalidación, interrupción y cleanup.

### Feature modules conectados

- renderizar con un registry real y atoms de producción;
- sustituir solo adapters externos;
- comprobar estados observables e interacción accesible;
- no afirmar detalles internos del grafo de atoms.

### Módulos visuales

- probar exclusivamente por props, roles y eventos;
- añadir stories para estados visuales relevantes;
- no requerir el composition root para importar una story.

### Routes y pages

- routes: decoding, identidad y selección de página;
- pages: composición estructural y estados completos de página;
- no repetir en pages los tests de comportamiento ya cubiertos por atoms.

## Reglas ejecutables requeridas

La arquitectura debe protegerse mediante ESLint, dependency-cruiser o tests estáticos. Como mínimo deben fallar:

- imports profundos entre features;
- imports de composition desde módulos;
- imports de atoms desde `packages/ui` o patterns genéricos;
- imports de React/DOM desde `frontend-core`;
- acceso a browser globals fuera de adapters;
- `Effect.runPromise` en módulos React;
- fetch en `useEffect`;
- atoms recibidos como props en módulos de aplicación;
- nuevas primitives locales equivalentes a exports existentes de `@proxus/ui`.

Una excepción necesita un comentario `architecture-allow` con motivo verificable y alcance mínimo. No se admiten allowlists globales para ocultar deuda.

## Referencias evaluadas

### `.repos/effect-ai-chat-example`

Se adoptan:

- un `RegistryProvider` de aplicación;
- routes que entregan IDs branded;
- props con IDs, keys e inputs pequeños;
- atoms derivados en el punto de uso;
- `Atom.family` para chat, input, streaming y mutaciones por `chatId`;
- hojas visuales que reciben datos normales;
- prohibición de pasar atoms como props.

No se copia:

- colocación de toda la implementación de chat bajo `routes/chat/-lib`;
- un archivo de atoms monolítico al crecer la feature;
- markup visual sin el sistema `@proxus/ui`;
- peculiaridades RPC/streaming que no correspondan al dominio Proxus.

### `.repos/effect-monorepo-template`

Se adoptan:

- clasificación explícita de UI, patterns, modules, pages/screens y routing;
- entry points de feature;
- prohibición de imports profundos;
- ownership del markup estructural;
- checks arquitectónicos ejecutables.

Se adapta:

- TanStack Router se sustituye por el router tipado de Proxus;
- su separación container/presentation se reemplaza por identidad → atom family → módulo visual;
- Effect Atom, no un screen central, posee el estado de aplicación.

### Vercel Composition Patterns

Se adoptan compounds, children y variantes explícitas para módulos visuales complejos. No se adopta un React Context de `{ state, actions, meta }` cuando Effect Atom ya posee ese estado; Context queda restringido a metadata estructural privada.

## Criterio de revisión

Antes de aprobar un módulo frontend, responder:

1. ¿Recibe identidad estable o está recibiendo estado de aplicación ya resuelto?
2. ¿El estado tiene el owner correcto según la tabla?
3. ¿Necesita `Atom.family` para evitar fugas entre instancias?
4. ¿Consulta solo atoms de su propia feature?
5. ¿Preserva los estados reales de `AsyncResult`?
6. ¿Es un módulo conectado o visual, y su interface lo refleja?
7. ¿Está duplicando Effect Atom mediante Context o estado React?
8. ¿Su estructura compleja necesita composición o solo se está fragmentando por líneas?
9. ¿Puede probarse a través de la misma interface que usa producción?
10. ¿Respeta entry points, adapters y límites de package?
