# Propuesta de máquina frontend jerárquica

## Estado

Propuesta exploratoria. No sustituye la arquitectura atom-first normativa ni
describe todavía una API implementada. Su objetivo es fijar el modelo mental
antes de diseñar la librería y evolucionar `apps/web-fsm`.

## Objetivo

La aplicación se define como un árbol de nodos. Cada nodo puede poseer datos
locales, mensajes, comandos, estados hijos y una función pura `update`.

La máquina compuesta expone una única función global:

```text
AppSnapshot + AppMessage
            ↓
      AppMachine.update
            ↓
AppSnapshot + AppCommand[]
```

Los comandos se interpretan con Effect y sus resultados vuelven a entrar como
mensajes. React recibe un snapshot y una función `send`; nunca ejecuta comandos
ni modifica el modelo directamente.

## Composición de estados

Los estados hijos son exclusivos por defecto. Un nodo normal declara un objeto
`states` y exactamente uno de sus hijos está activo:

```ts
const Folder = Node.make("folder", {
  data: FolderData,
  initial: "loading",
  states: {
    loading: FolderLoading,
    failed: FolderFailed,
    loaded: FolderLoaded,
  },
})
```

Esto infiere una unión discriminada:

```ts
type FolderState =
  | FolderLoadingState
  | FolderFailedState
  | FolderLoadedState
```

El caso especial son las regiones paralelas:

```ts
const FolderLoaded = Node.make("loaded", {
  data: FolderLoadedData,
  states: States.parallel({
    sidebar: Sidebar,
    lessons: Lessons,
    chat: Chat,
  }),
})
```

Cada región está activa, pero mantiene una selección exclusiva propia. El
estado resultante es un producto de uniones, no una unión cartesiana de todas
las combinaciones:

```ts
type FolderLoadedState = {
  readonly states: {
    readonly sidebar: SidebarState
    readonly lessons: LessonsState
    readonly chat: ChatState
  }
}
```

Por ejemplo, pueden estar activos simultáneamente `sidebar.expanded`,
`lessons.opened` y `chat.closed`, pero `sidebar.expanded` y
`sidebar.collapsed` nunca están activos a la vez.

## Ownership

La regla estructural principal es:

> El nodo que posee un dato o una selección de estados es el único que puede
> actualizarlos.

`Folder` posee la selección `loading | failed | loaded`. Por tanto,
`Folder.update` puede cambiarla. `FolderLoading` no puede reemplazarse a sí
mismo por su hermano `FolderLoaded`.

Esto también determina dónde declarar un mensaje:

- Un mensaje que actualiza datos locales pertenece al nodo local.
- Un mensaje que cambia el hijo activo pertenece al padre que posee esa
  selección.
- Un mensaje que abandona un subárbol pertenece al ancestro que posee ese
  subárbol.

Por ejemplo:

```text
TitleChanged       → LessonOpened
FolderLoaded       → Folder
LogoutRequested    → App
```

Aunque `LogoutRequested` pertenezca a `App`, cualquier vista situada debajo de
`loggedIn` puede enviarlo porque las capacidades de envío de una posición
incluyen los mensajes de ese nodo y de todos sus ancestros.

## Update local

No se declaran transiciones como una lista separada de `from`, `message` y
`to`. Una transición es el resultado observable de procesar un mensaje:

```text
estado anterior + mensaje → estado siguiente + comandos
```

El padre organiza sus handlers por hijo activo:

```ts
const Folder = Node.make("folder", {
  data: FolderData,
  messages: {
    FolderLoaded,
    FolderLoadFailed,
    RefreshRequested,
  },
  commands: {
    LoadFolder,
  },
  initial: "loading",
  states: {
    loading: FolderLoading,
    failed: FolderFailed,
    loaded: FolderLoaded,
  },
  update: Node.update({
    loading: Message.match({
      FolderLoaded: (message) =>
        Update.state("loaded", {
          folderName: message.folderName,
          lessons: message.lessons,
        }),
      FolderLoadFailed: (message) =>
        Update.state("failed", {
          error: message.error,
        }),
    }),
    failed: Message.match({
      RefreshRequested: (_, context) =>
        Update.state("loading").commands(
          LoadFolder({ folderId: context.data.folderId }),
        ),
    }),
    loaded: Message.match({
      RefreshRequested: (_, context) =>
        Update.state("loading").commands(
          LoadFolder({ folderId: context.data.folderId }),
        ),
    }),
  }),
})
```

La API exacta queda abierta, pero el resultado de un update debe poder expresar
al menos:

```ts
Update.unhandled()
Update.stay()
Update.data(nextData)
Update.state("loaded", loadedData)
Update.commands(command)
Update.state("loaded", loadedData).commands(command)
```

`Update.state` solo acepta hijos propiedad del nodo. Esto impide, por ejemplo,
que `Folder.update` seleccione directamente `dashboard` o `registering`.

## Composición de updates

Los updates no forman una cadena de reducers ejecutada desde la hoja hasta la
raíz. Cada descriptor de mensaje tiene identidad propia y se registra en el
nodo que lo declara. Al compilar el árbol, `Machine.make` construye un índice:

```text
FolderLoaded      → app.loggedIn.folder
TitleChanged      → app.loggedIn.folder.loaded.lessons.opened
LogoutRequested   → app
```

El dispatcher global sigue estos pasos:

1. Encuentra el nodo propietario del mensaje.
2. Comprueba que el nodo está activo en el snapshot actual.
3. Enfoca el snapshot en ese nodo.
4. Ejecuta únicamente su `update`.
5. Inserta el resultado en el snapshot global.
6. Publica atómicamente el nuevo snapshot.
7. Entrega los comandos al runtime de Effect.

Conceptualmente, la composición es `focus + update + splice`:

```ts
function updateMachine(
  machine: CompiledMachine,
  snapshot: AppSnapshot,
  message: AppMessage,
): readonly [AppSnapshot, ReadonlyArray<AppCommand>] {
  const owner = machine.messageOwners.get(message._tag)

  if (owner === undefined || !Snapshot.isActive(snapshot, owner.path)) {
    return [snapshot, []]
  }

  const focused = Snapshot.focus(snapshot, owner.path)
  const result = owner.update({
    data: focused.localData,
    context: focused.ancestorData,
    state: focused.childState,
    message,
  })

  return [
    Snapshot.apply(snapshot, owner.path, result),
    result.commands,
  ]
}
```

Así se evita decidir dinámicamente si un mensaje debe burbujear, qué handler
tiene prioridad o si padre e hijo deben ejecutarse. El mensaje ya identifica a
su propietario.

## Datos y mensajes contextuales

La definición de un nodo aislado solo conoce sus datos y mensajes locales. La
máquina compilada infiere los tipos correspondientes a una posición:

```ts
type OpenedLessonState = Machine.StateAt<
  typeof AppMachine,
  ["loggedIn", "folder", "loaded", "lessons", "opened"]
>

type OpenedLessonData = Machine.DataAt<
  typeof AppMachine,
  ["loggedIn", "folder", "loaded", "lessons", "opened"]
>

type OpenedLessonMessages = Machine.MessagesAt<
  typeof AppMachine,
  ["loggedIn", "folder", "loaded", "lessons", "opened"]
>
```

`DataAt` acumula datos locales y de ancestros usando namespaces para evitar
colisiones:

```ts
model.data.loggedIn.sessionId
model.data.folder.folderId
model.data.loaded.folderName
model.data.opened.lessonId
```

`MessagesAt` contiene los mensajes del nodo situado y de sus ancestros, pero no
los mensajes privados de ramas o regiones hermanas.

## Regiones paralelas

Cada región posee y actualiza su propia selección:

```ts
const Sidebar = Node.make("sidebar", {
  messages: { SidebarToggled },
  initial: "expanded",
  states: {
    expanded: SidebarExpanded,
    collapsed: SidebarCollapsed,
  },
  update: Node.update({
    expanded: Message.match({
      SidebarToggled: () => Update.state("collapsed"),
    }),
    collapsed: Message.match({
      SidebarToggled: () => Update.state("expanded"),
    }),
  }),
})
```

`SidebarToggled` se dirige únicamente a `Sidebar.update`. No ejecuta los
updates de `Lessons`, `Chat` o `FolderLoaded`.

Si un mensaje debe coordinar varias regiones, pertenece al padre paralelo:

```ts
const FolderLoaded = Node.make("loaded", {
  messages: { OpenLessonWithChat },
  states: States.parallel({
    sidebar: Sidebar,
    lessons: Lessons,
    chat: Chat,
  }),
  update: Message.match({
    OpenLessonWithChat: (message) =>
      Update.states({
        lessons: Update.state("opened", {
          lessonId: message.lessonId,
        }),
        chat: Update.state("opened", {
          conversationId: message.conversationId,
        }),
      }),
  }),
})
```

Las dos modificaciones se aplican al mismo snapshot. Una región nunca modifica
directamente una región hermana.

## Commands y Effect

Los comandos son valores declarados en el protocolo de la máquina. Sus
implementaciones viven fuera de los nodos:

```ts
const AppCommandHandlersLive = CommandHandlers.make(
  AppMachine.commands,
  {
    LoadFolder: (command) =>
      FolderApi.get(command.folderId).pipe(
        Effect.map(FolderLoaded),
        Effect.catchTag("FolderApiError", (error) =>
          Effect.succeed(FolderLoadFailed({ error })),
        ),
      ),
    SaveLesson: (command) => LessonApi.save(command),
  },
)
```

El contrato de un comando restringe los mensajes que puede emitir. La
implementación live, de test o de Storybook debe implementar todos los comandos
declarados sin poder devolver mensajes arbitrarios.

El ciclo completo es:

```text
Message
   ↓
update puro del nodo propietario
   ↓
Snapshot + Command[]
   ↓
handlers Effect
   ↓
Message
```

## Integración con React

React consume tipos derivados de la máquina, no las definiciones internas de
los nodos:

```tsx
type FolderProps = Machine.ViewPropsAt<
  typeof AppMachine,
  ["loggedIn", "folder"]
>

function FolderView(props: FolderProps) {
  return Machine.match(props, {
    loading: (loading) => <FolderLoadingView {...loading} />,
    failed: (failed) => <FolderFailedView {...failed} />,
    loaded: (loaded) => <FolderLoadedView {...loaded} />,
  })
}
```

Un nodo paralelo renderiza todas sus regiones:

```tsx
function FolderLoadedView(props: FolderLoadedProps) {
  const regions = Machine.regions(props)

  return (
    <FolderLayout
      title={props.model.data.loaded.folderName}
      sidebar={<SidebarView {...regions.sidebar} />}
      content={<LessonsView {...regions.lessons} />}
      chat={<ChatView {...regions.chat} />}
    />
  )
}
```

La correspondencia es directa:

```text
states exclusivos → match exhaustivo → un componente hijo
states paralelos  → composición       → un componente por región
```

Las vistas puras reciben siempre `model` y `send`, por lo que una story puede
construir un estado situado y renderizarlo sin montar el runtime:

```tsx
<FolderLoadedView model={model} send={action("message")} />
```

Effect Atom queda limitado al binding conectado que publica el snapshot y
despacha mensajes a `AppMachine.update`.

## Inspección y grafos

Al no declarar `from → message → to` por separado, una función TypeScript
arbitraria no permite obtener siempre el grafo estático completo. La primera
versión puede construir un grafo observado a partir del timeline del runtime,
tests y stories:

```ts
{
  before: "folder.loading",
  message: "FolderLoaded",
  after: "folder.loaded",
  commands: [],
}
```

La organización de `Node.update` por estado y mensaje permite inferir qué
mensajes acepta cada posición, aunque no necesariamente todos sus destinos. Si
fuera imprescindible generar un grafo estático completo, podría añadirse más
adelante metadata opcional de destinos sin convertirla en una segunda fuente de
comportamiento.

## Decisiones abiertas

- Forma final de `Node.update`, `Message.match` y `Update`.
- Política ante mensajes cuyo nodo propietario está inactivo: ignorar, registrar
  diagnóstico o tratarlo como error en desarrollo.
- Identidad y cancelación de comandos al abandonar el scope de un nodo.
- Contrato para subscriptions continuas además de comandos de una sola
  respuesta.
- Inicialización de nodos y regiones que requiere comandos de entrada.
- Serialización de snapshots, migraciones y restauración desde persistencia.
- Representación y visualización de grafos estáticos frente a observados.
- Ergonomía de fixtures situados para tests y Storybook.
