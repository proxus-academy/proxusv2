import { Context, Effect, Layer, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export type RouteParams = Readonly<Record<string, unknown>>

declare const RouteParamsTypeId: unique symbol
const DestinationTypeId = Symbol.for("@proxus/frontend-core/routing/RouteDestination")

type SegmentCodec<A> = Schema.Codec<A, string, never, never>
type AnySegmentCodec = SegmentCodec<unknown>

type RuntimeRouteNode = {
  readonly id: string
  readonly children: readonly RuntimeRouteNode[]
  readonly terminal: boolean
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
> = RuntimeRouteNode & {
  readonly id: Id
  readonly children: Children
  readonly terminal: Terminal
  readonly [RouteParamsTypeId]?: Params
}

type AnyRouteNode = RouteNode

export const root = <const Id extends string, const Children extends readonly RuntimeRouteNode[]>(input: {
  readonly id: Id
  readonly children: Children
}): RouteNode<Id, {}, Children, false> => ({ kind: "root", terminal: false, ...input })

export const layout = <const Id extends string, const Children extends readonly RuntimeRouteNode[]>(input: {
  readonly id: Id
  readonly children: Children
}): RouteNode<Id, {}, Children, false> => ({ kind: "layout", terminal: false, ...input })

export function path<const Id extends string>(input: {
  readonly id: Id
  readonly path: string
}): RouteNode<Id, {}, [], true>
export function path<const Id extends string, const Children extends readonly RuntimeRouteNode[]>(input: {
  readonly id: Id
  readonly path: string
  readonly children: Children
}): RouteNode<Id, {}, Children, false>
export function path(input: {
  readonly id: string
  readonly path: string
  readonly children?: readonly RuntimeRouteNode[]
}): RuntimeRouteNode {
  const children = input.children ?? []
  return { kind: "path", id: input.id, segment: input.path, children, terminal: children.length === 0 }
}

export const index = <const Id extends string>(input: {
  readonly id: Id
}): RouteNode<Id, {}, [], true> => ({ kind: "index", id: input.id, children: [], terminal: true })

export function param<const Id extends string, const Name extends string, A>(input: {
  readonly id: Id
  readonly name: Name
  readonly schema: SegmentCodec<A>
}): RouteNode<Id, { readonly [Key in Name]: A }, [], true>
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
}): RuntimeRouteNode {
  const children = input.children ?? []
  return { kind: "param", id: input.id, name: input.name, schema: input.schema, children, terminal: children.length === 0 }
}

type ParamsOf<Node extends AnyRouteNode> = NonNullable<Node[typeof RouteParamsTypeId]>
type Merge<Left, Right> = Omit<Left, keyof Right> & Right
type IsTerminal<Node extends AnyRouteNode> = Node["terminal"] extends true ? true : false
type ChildEntries<
  Child,
  ParentParams extends RouteParams,
  Depth extends readonly unknown[],
> = Child extends AnyRouteNode ? Entries<Child, ParentParams, Depth> : never

type Entries<
  Node extends AnyRouteNode,
  ParentParams extends RouteParams = {},
  Depth extends readonly unknown[] = [],
> = Depth["length"] extends 16 ? never
  : IsTerminal<Node> extends true
    ? { readonly id: Node["id"]; readonly params: Merge<ParentParams, ParamsOf<Node>> }
    : ChildEntries<
        Node["children"][number],
        Merge<ParentParams, ParamsOf<Node>>,
        [...Depth, unknown]
      >

type RouteEntry<Node extends AnyRouteNode> = Entries<Node> extends infer Entry extends {
  readonly id: string
  readonly params: RouteParams
} ? Entry : never
type RouteId<Node extends AnyRouteNode> = RouteEntry<Node>["id"]
type EntryFor<Node extends AnyRouteNode, Id extends RouteId<Node>> = Extract<RouteEntry<Node>, { id: Id }>
type InputFor<Entry extends { readonly params: RouteParams }> = keyof Entry["params"] extends never
  ? []
  : [params: Entry["params"]]

export interface RouteDestination<
  Id extends string = string,
  Params extends RouteParams = RouteParams,
> {
  readonly [DestinationTypeId]: true
  readonly id: Id
  readonly params: Params
}

export type DestinationOf<Node extends AnyRouteNode> = RouteEntry<Node> extends infer Entry extends {
  readonly id: string
  readonly params: RouteParams
} ? RouteDestination<Entry["id"], Entry["params"]> : never

export interface RouteMatch {
  readonly id: string
  readonly params: RouteParams
}

export interface DecodedRoute<Destination extends RouteDestination = RouteDestination> {
  readonly destination: Destination
  readonly matches: readonly RouteMatch[]
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
  ) => RouteDestination<Id, EntryFor<Node, Id>["params"]>
  readonly encode: (
    destination: DestinationOf<Node>,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly encodeDestination: (
    destination: RouteDestination,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly decode: (
    pathname: string,
  ) => Effect.Effect<DecodedRoute<DestinationOf<Node>>, RouteNotFound>
}

interface CompiledRecord {
  readonly chain: readonly RuntimeRouteNode[]
}

export const compile = <Node extends AnyRouteNode>(tree: Node): CompiledRoutes<Node> => {
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
  ): RouteDestination<Id, EntryFor<Node, Id>["params"]> => ({
    [DestinationTypeId]: true,
    id,
    params: input[0] ?? {},
  })

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
    ): Effect.Effect<DecodedRoute<DestinationOf<Node>> | undefined> => Effect.gen(function*() {
      const nextMatches = [...matches, { id: node.id, params }]

      if (offset === parts.length) {
        const indexNode = node.children.find((child) => child.kind === "index")
        if (indexNode !== undefined) return yield* walk(indexNode, offset, params, nextMatches)
        const layoutNode = node.children.find((child) => child.kind === "layout")
        if (layoutNode !== undefined) return yield* walk(layoutNode, offset, params, nextMatches)
        if (terminalRoutes.has(node.id)) {
          return {
            destination: {
              [DestinationTypeId]: true,
              id: node.id,
              params,
            } as DestinationOf<Node>,
            matches: nextMatches,
          }
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
    decode,
  }
}

export class NavigationError extends Schema.TaggedErrorClass<NavigationError>()(
  "NavigationError",
  {
    operation: Schema.Literals(["push", "replace", "back", "forward"]),
    message: Schema.String,
  },
) {}

export interface RouterService<Destination extends RouteDestination> {
  readonly current: Atom.Atom<Destination>
  readonly push: (destination: Destination) => Effect.Effect<void, NavigationError>
  readonly replace: (destination: Destination) => Effect.Effect<void, NavigationError>
  readonly back: Effect.Effect<void, NavigationError>
  readonly forward: Effect.Effect<void, NavigationError>
}

export interface RouterIdentifier<Destination extends RouteDestination> {
  readonly destination: Destination
}

export type RouterTag<Destination extends RouteDestination> = Context.Service<
  RouterIdentifier<Destination>,
  RouterService<Destination>
>

export const makeRouterService = <Destination extends RouteDestination>(
  key: string,
): RouterTag<Destination> => Context.Service<
  RouterIdentifier<Destination>,
  RouterService<Destination>
>(key)

const makeCurrentRoute = <Destination extends RouteDestination>(initial: Destination) => {
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
    set: (destination: Destination) => {
      current = destination
      listeners.forEach((listener) => listener())
    },
  }
}

export const memoryRouterLayer = <Destination extends RouteDestination>(
  routerTag: RouterTag<Destination>,
  initial: Destination,
): Layer.Layer<RouterIdentifier<Destination>> =>
  Layer.sync(routerTag, () => {
    const current = makeCurrentRoute(initial)
    let history = [initial]
    let cursor = 0
    const select = (next: number) => Effect.sync(() => {
      if (next < 0 || next >= history.length || next === cursor) return
      cursor = next
      current.set(history[cursor]!)
    })
    return routerTag.of({
      current: current.atom,
      push: (next) => Effect.sync(() => {
        history = [...history.slice(0, cursor + 1), next]
        cursor++
        current.set(next)
      }),
      replace: (next) => Effect.sync(() => {
        history = history.map((item, indexValue) => indexValue === cursor ? next : item)
        current.set(next)
      }),
      back: Effect.suspend(() => select(cursor - 1)),
      forward: Effect.suspend(() => select(cursor + 1)),
    })
  })
