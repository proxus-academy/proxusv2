import { Context, Effect, Layer, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export type RouteParams = Readonly<Record<string, unknown>>
export type RouteQuery = Readonly<Record<string, unknown>>
export type EncodedRouteQuery = Readonly<Record<string, string | ReadonlyArray<string> | undefined>>

declare const RouteParamsTypeId: unique symbol
declare const RouteQueryTypeId: unique symbol
const DestinationTypeId = Symbol.for("@proxus/frontend-core/routing/RouteDestination")

type SegmentCodec<A> = Schema.Codec<A, string, never, never>
type AnySegmentCodec = SegmentCodec<unknown>
type QueryCodec<A extends RouteQuery> = Schema.Codec<A, EncodedRouteQuery, never, never>
type AnyQueryCodec = QueryCodec<RouteQuery>

type RuntimeRouteNode = {
  readonly id: string
  readonly children: readonly RuntimeRouteNode[]
  readonly terminal: boolean
  readonly query?: AnyQueryCodec
} & (
  | { readonly kind: "root" | "layout" | "index" }
  | { readonly kind: "path"; readonly segment: string }
  | { readonly kind: "param"; readonly name: string; readonly schema: AnySegmentCodec }
)

export type RouteNode<
  Id extends string = string,
  Params extends RouteParams = RouteParams,
  Children extends readonly RuntimeRouteNode[] = readonly RuntimeRouteNode[],
  Terminal extends boolean = boolean,
  Query extends RouteQuery = {},
> = RuntimeRouteNode & {
  readonly id: Id
  readonly children: Children
  readonly terminal: Terminal
  readonly [RouteParamsTypeId]?: Params
  readonly [RouteQueryTypeId]?: Query
}

export type RootRouteNode<
  Id extends string = string,
  Children extends readonly RuntimeRouteNode[] = readonly RuntimeRouteNode[],
> = RouteNode<Id, {}, Children, false> & { readonly kind: "root" }

type AnyRouteNode = RouteNode

export const root = <const Id extends string, const Children extends readonly RuntimeRouteNode[]>(input: {
  readonly id: Id
  readonly children: Children
}): RootRouteNode<Id, Children> => ({ kind: "root", terminal: false, ...input })

export const layout = <const Id extends string, const Children extends readonly RuntimeRouteNode[]>(input: {
  readonly id: Id
  readonly children: Children
}): RouteNode<Id, {}, Children, false> => ({ kind: "layout", terminal: false, ...input })

export function path<const Id extends string>(input: {
  readonly id: Id
  readonly path: string
}): RouteNode<Id, {}, [], true>
export function path<const Id extends string, Query extends RouteQuery>(input: {
  readonly id: Id
  readonly path: string
  readonly query: QueryCodec<Query>
}): RouteNode<Id, {}, [], true, Query>
export function path<const Id extends string, const Children extends readonly RuntimeRouteNode[]>(input: {
  readonly id: Id
  readonly path: string
  readonly children: Children
}): RouteNode<Id, {}, Children, false>
export function path(input: {
  readonly id: string
  readonly path: string
  readonly children?: readonly RuntimeRouteNode[]
  readonly query?: AnyQueryCodec
}): RuntimeRouteNode {
  const children = input.children ?? []
  return {
    kind: "path",
    id: input.id,
    segment: input.path,
    children,
    terminal: children.length === 0,
    ...(input.query === undefined ? {} : { query: input.query }),
  }
}

export function index<const Id extends string>(input: {
  readonly id: Id
}): RouteNode<Id, {}, [], true>
export function index<const Id extends string, Query extends RouteQuery>(input: {
  readonly id: Id
  readonly query: QueryCodec<Query>
}): RouteNode<Id, {}, [], true, Query>
export function index(input: { readonly id: string; readonly query?: AnyQueryCodec }): RuntimeRouteNode {
  return {
    kind: "index",
    id: input.id,
    children: [],
    terminal: true,
    ...(input.query === undefined ? {} : { query: input.query }),
  }
}

export function param<const Id extends string, const Name extends string, A>(input: {
  readonly id: Id
  readonly name: Name
  readonly schema: SegmentCodec<A>
}): RouteNode<Id, { readonly [Key in Name]: A }, [], true>
export function param<const Id extends string, const Name extends string, A, Query extends RouteQuery>(input: {
  readonly id: Id
  readonly name: Name
  readonly schema: SegmentCodec<A>
  readonly query: QueryCodec<Query>
}): RouteNode<Id, { readonly [Key in Name]: A }, [], true, Query>
export function param<
  const Id extends string,
  const Name extends string,
  A,
  const Children extends readonly RuntimeRouteNode[],
>(input: {
  readonly id: Id
  readonly name: Name
  readonly schema: SegmentCodec<A>
  readonly children: Children
}): RouteNode<Id, { readonly [Key in Name]: A }, Children, false>
export function param(input: {
  readonly id: string
  readonly name: string
  readonly schema: AnySegmentCodec
  readonly children?: readonly RuntimeRouteNode[]
  readonly query?: AnyQueryCodec
}): RuntimeRouteNode {
  const children = input.children ?? []
  return {
    kind: "param",
    id: input.id,
    name: input.name,
    schema: input.schema,
    children,
    terminal: children.length === 0,
    ...(input.query === undefined ? {} : { query: input.query }),
  }
}

type ParamsOf<Node extends AnyRouteNode> = NonNullable<Node[typeof RouteParamsTypeId]>
type QueryOf<Node extends AnyRouteNode> = NonNullable<Node[typeof RouteQueryTypeId]>
type Merge<Left, Right> = Omit<Left, keyof Right> & Right
type IsTerminal<Node extends AnyRouteNode> = Node["terminal"] extends true ? true : false
type ChildEntries<
  Child,
  ParentParams extends RouteParams,
  Depth extends readonly 1[],
> = Child extends AnyRouteNode ? Entries<Child, ParentParams, Depth> : never

type Entries<
  Node extends AnyRouteNode,
  ParentParams extends RouteParams = {},
  Depth extends readonly 1[] = [],
> = Depth["length"] extends 16 ? never
  : IsTerminal<Node> extends true
    ? {
        readonly id: Node["id"]
        readonly params: Merge<ParentParams, ParamsOf<Node>>
        readonly query: QueryOf<Node>
      }
    : ChildEntries<
        Node["children"][number],
        Merge<ParentParams, ParamsOf<Node>>,
        [...Depth, 1]
      >

type ChildMatches<
  Child,
  ParentParams extends RouteParams,
  Depth extends readonly 1[],
> = Child extends AnyRouteNode ? MatchEntries<Child, ParentParams, Depth> : never

type MatchEntries<
  Node extends AnyRouteNode,
  ParentParams extends RouteParams = {},
  Depth extends readonly 1[] = [],
> = Depth["length"] extends 16 ? never
  : | {
      readonly id: Node["id"]
      readonly params: Merge<ParentParams, ParamsOf<Node>>
    }
    | ChildMatches<
        Node["children"][number],
        Merge<ParentParams, ParamsOf<Node>>,
        [...Depth, 1]
      >

type ValidEntry<Entry> = Entry extends {
  readonly id: string
  readonly params: RouteParams
  readonly query: RouteQuery
} ? Entry : never

type RouteEntry<Node extends AnyRouteNode> = ValidEntry<Entries<Node>>
type RouteId<Node extends AnyRouteNode> = RouteEntry<Node>["id"]
type EntryFor<Node extends AnyRouteNode, Id extends RouteId<Node>> = Extract<RouteEntry<Node>, { id: Id }>
type RequiredKeys<Value> = {
  [Key in keyof Value]-?: {} extends Pick<Value, Key> ? never : Key
}[keyof Value]
type PathSection<Path extends RouteParams> = keyof Path extends never
  ? {}
  : { readonly path: Path }
type QuerySection<Query extends RouteQuery> = keyof Query extends never
  ? {}
  : RequiredKeys<Query> extends never
    ? { readonly query?: Query }
    : { readonly query: Query }
type DestinationInput<Entry extends { readonly params: RouteParams; readonly query: RouteQuery }> =
  PathSection<Entry["params"]> & QuerySection<Entry["query"]>
type InputFor<Entry extends { readonly params: RouteParams; readonly query: RouteQuery }> =
  keyof Entry["params"] extends never
    ? RequiredKeys<Entry["query"]> extends never
      ? [input?: DestinationInput<Entry>]
      : [input: DestinationInput<Entry>]
    : [input: DestinationInput<Entry>]

export interface RouteDestination<
  Id extends string = string,
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery,
> {
  readonly [DestinationTypeId]: true
  readonly id: Id
  readonly params: Params
  readonly query: Query
}

type DestinationFor<Entry> = Entry extends {
  readonly id: string
  readonly params: RouteParams
  readonly query: RouteQuery
} ? RouteDestination<Entry["id"], Entry["params"], Entry["query"]> : never

export type DestinationOf<Node extends AnyRouteNode> = DestinationFor<RouteEntry<Node>>

export interface RouteMatch<
  Id extends string = string,
  Params extends RouteParams = RouteParams,
> {
  readonly id: Id
  readonly params: Params
}

type RouteMatchFor<Match> = Match extends {
  readonly id: string
  readonly params: RouteParams
} ? RouteMatch<Match["id"], Match["params"]> : never

export type MatchOf<Node extends AnyRouteNode> = RouteMatchFor<MatchEntries<Node>>

export interface DecodedRoute<
  Destination extends RouteDestination = RouteDestination,
  Match extends RouteMatch = RouteMatch,
> {
  readonly destination: Destination
  readonly matches: readonly Match[]
}

export class RouteConfigurationError extends Schema.TaggedErrorClass<RouteConfigurationError>()(
  "RouteConfigurationError",
  { message: Schema.String },
) {}

export class RouteNotFound extends Schema.TaggedErrorClass<RouteNotFound>()(
  "RouteNotFound",
  { pathname: Schema.String },
) {}

export class RouteEncodingError extends Schema.TaggedErrorClass<RouteEncodingError>()(
  "RouteEncodingError",
  { routeId: Schema.String },
) {}

export interface CompiledRoutes<Node extends AnyRouteNode> {
  readonly destination: <Id extends RouteId<Node>>(
    id: Id,
    ...input: InputFor<EntryFor<Node, Id>>
  ) => RouteDestination<Id, EntryFor<Node, Id>["params"], EntryFor<Node, Id>["query"]>
  readonly encode: (
    destination: DestinationOf<Node>,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly encodeDestination: (
    destination: RouteDestination,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly encodeQuery: (
    destination: DestinationOf<Node>,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly withQuery: (
    destination: DestinationOf<Node>,
    search: string,
  ) => Effect.Effect<DestinationOf<Node>, Schema.SchemaError | RouteEncodingError>
  readonly makeDestination: (
    id: string,
    path: RouteParams,
    query: RouteQuery,
  ) => DestinationOf<Node>
  readonly decode: (
    pathname: string,
  ) => Effect.Effect<DecodedRoute<DestinationOf<Node>, MatchOf<Node>>, RouteNotFound>
}

interface CompiledRecord {
  readonly chain: readonly RuntimeRouteNode[]
}

function compiledDestination<
  Node extends AnyRouteNode,
  Id extends RouteId<Node>,
>(
  id: Id,
  ...input: InputFor<EntryFor<Node, Id>>
): RouteDestination<Id, EntryFor<Node, Id>["params"], EntryFor<Node, Id>["query"]>
function compiledDestination(
  id: string,
  input?: { readonly path?: RouteParams; readonly query?: RouteQuery },
): RouteDestination {
  return {
    [DestinationTypeId]: true,
    id,
    params: input?.path ?? {},
    query: input?.query ?? {},
  }
}

function navigationDestination<Node extends AnyRouteNode>(
  id: string,
  params: RouteParams,
  query: RouteQuery,
): DestinationOf<Node>
function navigationDestination(
  id: string,
  params: RouteParams,
  query: RouteQuery,
): RouteDestination {
  return { [DestinationTypeId]: true, id, params, query }
}

function destinationWithQuery<Destination extends RouteDestination>(
  destination: Destination,
  query: RouteQuery,
): Destination
function destinationWithQuery(
  destination: RouteDestination,
  query: RouteQuery,
): RouteDestination {
  return { ...destination, query }
}

// This overload is the single typed boundary after the decoder has matched an ID
// from the compiled tree and transformed every dynamic segment through its codec.
function decodedRoute<Node extends AnyRouteNode>(
  id: string,
  params: RouteParams,
  matches: readonly RouteMatch[],
): DecodedRoute<DestinationOf<Node>, MatchOf<Node>>
function decodedRoute(
  id: string,
  params: RouteParams,
  matches: readonly RouteMatch[],
): DecodedRoute {
  return {
    destination: {
      [DestinationTypeId]: true,
      id,
      params,
      query: {},
    },
    matches,
  }
}

export const compile = <Node extends RootRouteNode>(tree: Node): CompiledRoutes<Node> => {
  if (tree.kind !== "root") {
    throw new RouteConfigurationError({ message: "A compiled route definition must start at a typed root" })
  }

  const allIds = new Set<string>()
  const terminalRoutes = new Map<string, CompiledRecord>()
  const routePatterns = new Map<string, string>()

  const visit = (
    node: RuntimeRouteNode,
    chain: readonly RuntimeRouteNode[],
    parameterNames: ReadonlySet<string>,
  ): void => {
    if (allIds.has(node.id)) {
      throw new RouteConfigurationError({ message: `Duplicate route id: ${node.id}` })
    }
    allIds.add(node.id)

    if ((node.kind === "root" || node.kind === "layout") && node.children.length === 0) {
      throw new RouteConfigurationError({ message: `${node.kind} route ${node.id} must have children` })
    }
    if (node.kind === "index" && node.children.length > 0) {
      throw new RouteConfigurationError({ message: `Index route ${node.id} cannot have children` })
    }
    if (node.kind === "path" && (node.segment.length === 0 || node.segment.includes("/"))) {
      throw new RouteConfigurationError({ message: `Invalid path segment at ${node.id}` })
    }
    if (node.kind === "param" && parameterNames.has(node.name)) {
      throw new RouteConfigurationError({ message: `Duplicate nested parameter name: ${node.name}` })
    }
    if (node.query !== undefined && !node.terminal) {
      throw new RouteConfigurationError({ message: `Only terminal route ${node.id} may declare a query schema` })
    }

    const nextChain = [...chain, node]
    if (node.children.length === 0 && (node.kind === "path" || node.kind === "param" || node.kind === "index")) {
      const pattern = nextChain.flatMap((item) => {
        if (item.kind === "path") return [`/${item.segment}`]
        if (item.kind === "param") return ["/:parameter"]
        return []
      }).join("") || "/"
      const existing = routePatterns.get(pattern)
      if (existing !== undefined) {
        throw new RouteConfigurationError({
          message: `Routes ${existing} and ${node.id} encode to the same path pattern: ${pattern}`,
        })
      }
      routePatterns.set(pattern, node.id)
      terminalRoutes.set(node.id, { chain: nextChain })
    }

    const staticSegments = new Set<string>()
    let parameterChildren = 0
    let indexChildren = 0
    let layoutChildren = 0
    for (const child of node.children) {
      if (child.kind === "path") {
        if (staticSegments.has(child.segment)) {
          throw new RouteConfigurationError({ message: `Ambiguous static path: ${child.segment}` })
        }
        staticSegments.add(child.segment)
      } else if (child.kind === "param") {
        parameterChildren++
      } else if (child.kind === "index") {
        indexChildren++
      } else if (child.kind === "layout") {
        layoutChildren++
      }
    }
    if (parameterChildren > 1) throw new RouteConfigurationError({ message: `Ambiguous parameter children at ${node.id}` })
    if (indexChildren > 1) throw new RouteConfigurationError({ message: `Ambiguous index children at ${node.id}` })
    if (layoutChildren > 1) throw new RouteConfigurationError({ message: `Ambiguous layout children at ${node.id}` })

    const nextParameterNames = new Set(parameterNames)
    if (node.kind === "param") nextParameterNames.add(node.name)
    for (const child of node.children) visit(child, nextChain, nextParameterNames)
  }

  visit(tree, [], new Set())

  const destination = <Id extends RouteId<Node>>(
    id: Id,
    ...input: InputFor<EntryFor<Node, Id>>
  ): RouteDestination<Id, EntryFor<Node, Id>["params"], EntryFor<Node, Id>["query"]> =>
    compiledDestination<Node, Id>(id, ...input)

  const encodeDestination = (route: RouteDestination) => Effect.gen(function*() {
    const record = terminalRoutes.get(route.id)
    if (record === undefined) return yield* new RouteEncodingError({ routeId: route.id })

    const segments: string[] = []
    for (const node of record.chain) {
      if (node.kind === "path") segments.push(encodeURIComponent(node.segment))
      if (node.kind === "param") {
        const value = yield* Schema.encodeEffect(node.schema)(route.params[node.name])
        segments.push(encodeURIComponent(value))
      }
    }
    return `/${segments.join("/")}`
  })

  const queryCodecOf = (routeId: string): Effect.Effect<AnyQueryCodec | undefined, RouteEncodingError> => {
    const record = terminalRoutes.get(routeId)
    if (record === undefined) return Effect.fail(new RouteEncodingError({ routeId }))
    return Effect.succeed(record.chain.at(-1)?.query)
  }

  const encodeQuery = (route: DestinationOf<Node> & RouteDestination) => Effect.gen(function*() {
    const queryCodec = yield* queryCodecOf(route.id)
    if (queryCodec === undefined) return ""
    const encoded = yield* Schema.encodeEffect(queryCodec)(route.query)
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(encoded)) {
      if (value === undefined) continue
      if (typeof value === "string") {
        search.set(key, value)
      } else {
        for (const item of value) search.append(key, item)
      }
    }
    return search.toString()
  })

  const withQuery = (route: DestinationOf<Node> & RouteDestination, searchValue: string) => Effect.gen(function*() {
    const queryCodec = yield* queryCodecOf(route.id)
    if (queryCodec === undefined) return destinationWithQuery(route, {})
    const search = new URLSearchParams(searchValue)
    const encoded: Record<string, string | ReadonlyArray<string>> = {}
    for (const key of new Set(search.keys())) {
      const values = search.getAll(key)
      encoded[key] = values.length === 1 ? values[0] ?? "" : values
    }
    const query = yield* Schema.decodeUnknownEffect(queryCodec)(encoded)
    return destinationWithQuery(route, query)
  })

  const makeDestination = (id: string, params: RouteParams, query: RouteQuery): DestinationOf<Node> =>
    navigationDestination<Node>(id, params, query)

  const decodeParts = (pathname: string): Effect.Effect<readonly string[], RouteNotFound> =>
    Effect.try({
      try: () => {
        const pathValue = pathname.split(/[?#]/, 1)[0] ?? ""
        return pathValue.split("/").filter(Boolean).map(decodeURIComponent)
      },
      catch: () => new RouteNotFound({ pathname }),
    })

  const decode = (pathname: string) => Effect.gen(function*() {
    const parts = yield* decodeParts(pathname)

    const walk = (
      node: RuntimeRouteNode,
      offset: number,
      params: RouteParams,
      matches: readonly RouteMatch[],
    ): Effect.Effect<DecodedRoute<DestinationOf<Node>, MatchOf<Node>> | undefined> => Effect.gen(function*() {
      const nextMatches = [...matches, { id: node.id, params }]

      if (offset === parts.length) {
        const indexNode = node.children.find((child) => child.kind === "index")
        if (indexNode !== undefined) return yield* walk(indexNode, offset, params, nextMatches)
        const layoutNode = node.children.find((child) => child.kind === "layout")
        if (layoutNode !== undefined) return yield* walk(layoutNode, offset, params, nextMatches)
        if (terminalRoutes.has(node.id)) {
          return decodedRoute<Node>(node.id, params, nextMatches)
        }
        return undefined
      }

      const layoutNode = node.children.find((child) => child.kind === "layout")
      if (layoutNode !== undefined) {
        const result = yield* walk(layoutNode, offset, params, nextMatches)
        if (result !== undefined) return result
      }

      const staticNode = node.children.find(
        (child) => child.kind === "path" && child.segment === parts[offset],
      )
      if (staticNode !== undefined) {
        const result = yield* walk(staticNode, offset + 1, params, nextMatches)
        if (result !== undefined) return result
      }

      const parameterNode = node.children.find((child) => child.kind === "param")
      if (parameterNode?.kind === "param") {
        const decoded = yield* Effect.option(
          Schema.decodeUnknownEffect(parameterNode.schema)(parts[offset]),
        )
        if (decoded._tag === "Some") {
          const result = yield* walk(
            parameterNode,
            offset + 1,
            { ...params, [parameterNode.name]: decoded.value },
            nextMatches,
          )
          if (result !== undefined) return result
        }
      }
      return undefined
    })

    const decoded = yield* walk(tree, 0, {}, [])
    if (decoded === undefined) return yield* new RouteNotFound({ pathname })
    return decoded
  })

  return {
    destination,
    encode: (route) => encodeDestination(route),
    encodeDestination,
    encodeQuery,
    withQuery,
    makeDestination,
    decode,
  }
}

export class DocumentNavigationError extends Schema.TaggedErrorClass<DocumentNavigationError>()(
  "DocumentNavigationError",
  { message: Schema.String },
) {}

export class DocumentNavigation extends Context.Service<DocumentNavigation, {
  readonly assign: (url: string) => Effect.Effect<void, DocumentNavigationError>
}>()("@proxus/frontend-core/routing/index/DocumentNavigation") {}

export class NavigationError extends Schema.TaggedErrorClass<NavigationError>()(
  "NavigationError",
  {
    operation: Schema.Literals(["push", "replace", "back", "forward"]),
    message: Schema.String,
  },
) {}

export type RouterObservableError = NavigationError | RouteNotFound | RouteEncodingError | Schema.SchemaError
export type RouterCommandError = NavigationError | RouteEncodingError | Schema.SchemaError

export interface RouterLocation<Destination extends RouteDestination> {
  readonly destination: Destination
  /** Encoded query without the leading question mark. Platform-neutral by design. */
  readonly search: string
}

export interface NavigationOptions {
  readonly search?: string
}

type RouteIdOf<Destination extends RouteDestination> = Destination["id"]
type DestinationForId<Destination extends RouteDestination, Id extends RouteIdOf<Destination>> =
  Extract<Destination, { readonly id: Id }>
type NavigationPath<
  Destination extends RouteDestination,
  Id extends RouteIdOf<Destination>,
  ContextKey extends string,
> = Omit<DestinationForId<Destination, Id>["params"], ContextKey>
type NavigationQuery<Destination extends RouteDestination, Id extends RouteIdOf<Destination>> =
  DestinationForId<Destination, Id>["query"]
export type NavigationInput<
  Destination extends RouteDestination,
  Id extends RouteIdOf<Destination>,
  ContextKey extends string = never,
> = PathSection<NavigationPath<Destination, Id, ContextKey>> & QuerySection<NavigationQuery<Destination, Id>>
export type NavigationArguments<
  Destination extends RouteDestination,
  Id extends RouteIdOf<Destination>,
  ContextKey extends string = never,
> = keyof NavigationPath<Destination, Id, ContextKey> extends never
  ? RequiredKeys<NavigationQuery<Destination, Id>> extends never
    ? [input?: NavigationInput<Destination, Id, ContextKey>]
    : [input: NavigationInput<Destination, Id, ContextKey>]
  : [input: NavigationInput<Destination, Id, ContextKey>]

export interface RouterService<
  Destination extends RouteDestination,
  ContextKey extends string = never,
> {
  readonly current: Atom.Atom<Destination>
  readonly location: Atom.Atom<RouterLocation<Destination>>
  /** The latest routing failure. Successful navigation clears it. */
  readonly error: Atom.Atom<RouterObservableError | undefined>
  readonly navigate: <Id extends RouteIdOf<Destination>>(
    id: Id,
    ...input: NavigationArguments<Destination, Id, ContextKey>
  ) => Effect.Effect<void, RouterCommandError>
  readonly replace: <Id extends RouteIdOf<Destination>>(
    id: Id,
    ...input: NavigationArguments<Destination, Id, ContextKey>
  ) => Effect.Effect<void, RouterCommandError>
  /** Low-level escape hatch for preserving or editing an already encoded query. */
  readonly pushDestination: (
    destination: Destination,
    options?: NavigationOptions,
  ) => Effect.Effect<void, RouterCommandError>
  /** Low-level escape hatch for preserving or editing an already encoded query. */
  readonly replaceDestination: (
    destination: Destination,
    options?: NavigationOptions,
  ) => Effect.Effect<void, RouterCommandError>
  readonly back: Effect.Effect<void, NavigationError>
  readonly forward: Effect.Effect<void, NavigationError>
}

export interface RouterIdentifier<
  Destination extends RouteDestination,
  ContextKey extends string = never,
> {
  readonly destination: Destination
  readonly contextKey: ContextKey
}

export type RouterTag<
  Destination extends RouteDestination,
  ContextKey extends string = never,
> = Context.Service<
  RouterIdentifier<Destination, ContextKey>,
  RouterService<Destination, ContextKey>
>

export const makeRouterService = <
  Destination extends RouteDestination,
  ContextKey extends string = never,
>(key: string): RouterTag<Destination, ContextKey> => Context.Service<
  RouterIdentifier<Destination, ContextKey>,
  RouterService<Destination, ContextKey>
>(key)

export const makeObservableValue = <Value>(initial: Value) => {
  let current = initial
  const listeners = new Set<() => void>()
  const atom = Atom.readable((get) => {
    const listener = () => get.setSelf(current)
    listeners.add(listener)
    get.addFinalizer(() => listeners.delete(listener))
    return current
  })
  return {
    atom,
    get: () => current,
    set: (destination: Value) => {
      current = destination
      listeners.forEach((listener) => listener())
    },
  }
}

export interface RouterRoutes<Destination extends RouteDestination> {
  readonly makeDestination: (id: string, path: RouteParams, query: RouteQuery) => Destination
  readonly encodeQuery: (destination: Destination) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
}

export interface RouterLayerOptions<ContextKey extends string> {
  readonly contextParameters?: ReadonlyArray<ContextKey>
}

export const memoryRouterLayer = <
  Destination extends RouteDestination,
  ContextKey extends keyof Destination["params"] & string = never,
>(
  routerTag: RouterTag<Destination, ContextKey>,
  routes: RouterRoutes<Destination>,
  initial: Destination,
  options: RouterLayerOptions<ContextKey> = {},
): Layer.Layer<RouterIdentifier<Destination, ContextKey>> =>
  Layer.sync(routerTag, () => {
    interface RouterState {
      readonly location: RouterLocation<Destination>
      readonly error: RouterObservableError | undefined
    }

    const initialLocation: RouterLocation<Destination> = { destination: initial, search: "" }
    const state = makeObservableValue<RouterState>({ location: initialLocation, error: undefined })
    const current = Atom.map(state.atom, ({ location }) => location.destination)
    const location = Atom.map(state.atom, ({ location }) => location)
    const error = Atom.map(state.atom, ({ error }) => error)
    let history = [initialLocation]
    let cursor = 0
    const select = (next: number) => Effect.sync(() => {
      const selected = history[next]
      if (selected === undefined || next === cursor) return
      cursor = next
      state.set({ location: selected, error: undefined })
    })
    const changeDestination = (
      operation: "push" | "replace",
      destination: Destination,
      search: string,
    ) => Effect.sync(() => {
      const next: RouterLocation<Destination> = { destination, search }
      if (operation === "push") {
        history = [...history.slice(0, cursor + 1), next]
        cursor++
      } else {
        history = history.map((item, indexValue) => indexValue === cursor ? next : item)
      }
      state.set({ location: next, error: undefined })
    })
    const changeRoute = (
      operation: "push" | "replace",
      id: string,
      input?: { readonly path?: RouteParams; readonly query?: RouteQuery },
    ) => Effect.gen(function*() {
      const currentParams = state.get().location.destination.params
      const context = Object.fromEntries(
        (options.contextParameters ?? []).map((key) => [key, currentParams[key as string]]),
      )
      const destination = routes.makeDestination(
        id,
        { ...context, ...input?.path },
        input?.query ?? {},
      )
      const search = yield* routes.encodeQuery(destination)
      yield* changeDestination(operation, destination, search)
    })
    return routerTag.of({
      current,
      location,
      error,
      navigate: (id, ...input) => changeRoute("push", id, input[0]),
      replace: (id, ...input) => changeRoute("replace", id, input[0]),
      pushDestination: (destination, navigationOptions) => changeDestination(
        "push",
        destination,
        navigationOptions?.search ?? state.get().location.search,
      ),
      replaceDestination: (destination, navigationOptions) => changeDestination(
        "replace",
        destination,
        navigationOptions?.search ?? state.get().location.search,
      ),
      back: Effect.suspend(() => select(cursor - 1)),
      forward: Effect.suspend(() => select(cursor + 1)),
    })
  })
