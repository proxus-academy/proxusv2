import { createElement, type ReactNode } from "react"
import { Data, Effect, Option, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

declare const RouteContractTypeId: unique symbol

export type RouteComponent<Props> = (props: Props) => ReactNode

export interface RouteComponentProps<
  Params extends Readonly<Record<string, unknown>>,
  Search,
> {
  readonly params: Params
  readonly search: Search
}

export interface RouterLocation {
  readonly pathname: string
  readonly search: string
  readonly hash: string
}

export interface NotFoundProps {
  readonly location: RouterLocation
}

export interface InvalidUrlProps {
  readonly location: RouterLocation
  readonly issues: readonly unknown[]
}

export interface RouterErrorProps {
  readonly location: RouterLocation
  readonly error: unknown
}

type SegmentParam<Segment extends string> =
  Segment extends `:${infer Name}` ? Name : never

export type PathParamNames<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? SegmentParam<Head> | PathParamNames<Tail>
    : SegmentParam<Path>

type UrlParamSchema = Schema.ConstraintCodec<unknown, string, never, never>
type UrlSearchSchema = Schema.ConstraintCodec<unknown, unknown, never, never>

export type ParamSchemas<Path extends string> = {
  readonly [Name in PathParamNames<Path>]: UrlParamSchema
}

export type DecodedParams<Schemas extends Readonly<Record<string, UrlParamSchema>>> = {
  readonly [Name in keyof Schemas]: Schema.Schema.Type<Schemas[Name]>
}

type DecodedSearch<Search> =
  Search extends UrlSearchSchema ? Schema.Schema.Type<Search> : Readonly<Record<never, never>>

export type EncodedSearch = Readonly<Record<string, string | readonly string[]>>

export interface DecodedRouteNode {
  readonly params: Readonly<Record<string, unknown>>
  readonly search: unknown
  readonly render: () => ReactNode
}

export interface EncodedRouteNode {
  readonly params: Readonly<Record<string, string>>
  readonly search: EncodedSearch
}

interface RuntimeRouteNode {
  readonly _tag: "PathRoute" | "LayoutRoute" | "IndexRoute"
  readonly id?: string | undefined
  readonly path?: string | undefined
  readonly children: Routes
  readonly decode: (
    params: Readonly<Record<string, string>>,
    search: EncodedSearch,
  ) => Option.Option<DecodedRouteNode>
  readonly encode: (
    params: Readonly<Record<string, unknown>>,
    search: unknown,
  ) => Option.Option<EncodedRouteNode>
}

interface RouteContract<
  Id extends string | undefined,
  Params extends Readonly<Record<string, unknown>>,
  Search,
  Children extends Routes,
> {
  readonly id: Id
  readonly params: Params
  readonly search: Search
  readonly children: Children
}

interface ContractCarrier<
  Id extends string | undefined,
  Params extends Readonly<Record<string, unknown>>,
  Search,
  Children extends Routes,
> {
  readonly [RouteContractTypeId]?: RouteContract<Id, Params, Search, Children>
}

export type PathRouteNode<
  Id extends string | undefined = string | undefined,
  Path extends string = string,
  Params extends Readonly<Record<string, UrlParamSchema>> = Readonly<Record<string, UrlParamSchema>>,
  Search extends UrlSearchSchema | undefined = UrlSearchSchema | undefined,
  Children extends Routes = readonly [],
> = RuntimeRouteNode & ContractCarrier<Id, DecodedParams<Params>, DecodedSearch<Search>, Children> & {
  readonly _tag: "PathRoute"
  readonly path: Path
  readonly params: Params
  readonly search?: Search
  readonly Component: RouteComponent<RouteComponentProps<DecodedParams<Params>, DecodedSearch<Search>>>
}

export type LayoutRouteNode<Children extends Routes = readonly []> =
  RuntimeRouteNode & ContractCarrier<undefined, {}, {}, Children> & {
  readonly _tag: "LayoutRoute"
  readonly Layout: RouteComponent<{}>
}

export type IndexRouteNode<
  Id extends string | undefined = string | undefined,
  Search extends UrlSearchSchema | undefined = UrlSearchSchema | undefined,
> = RuntimeRouteNode & ContractCarrier<Id, {}, DecodedSearch<Search>, readonly []> & {
  readonly _tag: "IndexRoute"
  readonly index: true
  readonly search?: Search
  readonly Component: RouteComponent<RouteComponentProps<{}, DecodedSearch<Search>>>
}

export interface RouteNode extends RuntimeRouteNode {}

export type Routes = readonly RouteNode[]

type OptionalId<Id extends string | undefined> =
  undefined extends Id ? { readonly id?: undefined } : { readonly id: Id }

type OptionalSearch<Search extends UrlSearchSchema | undefined> =
  undefined extends Search
    ? { readonly search?: undefined }
    : { readonly search: Search }

type OptionalChildren<Children extends Routes> =
  readonly [] extends Children
    ? { readonly children?: Children }
    : { readonly children: Children }

type PathRouteOptions<
  Id extends string | undefined,
  Path extends string,
  Params extends ParamSchemas<Path>,
  Search extends UrlSearchSchema | undefined,
  Children extends Routes,
> =
  & OptionalId<Id>
  & OptionalSearch<Search>
  & OptionalChildren<Children>
  & {
    readonly path: Path
    readonly params: Params & {
      readonly [Name in Exclude<keyof Params, PathParamNames<Path>>]: never
    }
    readonly Component: RouteComponent<
      RouteComponentProps<DecodedParams<Params>, DecodedSearch<Search>>
    >
  }

const encodedSearchOf = (value: unknown): EncodedSearch => {
  if (typeof value !== "object" || value === null) return {}
  const encoded: Record<string, string | readonly string[]> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") encoded[key] = item
    else if (Array.isArray(item) && item.every((part) => typeof part === "string")) encoded[key] = item
  }
  return encoded
}

export const route = <
  const Id extends string | undefined = undefined,
  const Path extends string = string,
  const Params extends ParamSchemas<Path> = ParamSchemas<Path>,
  const Search extends UrlSearchSchema | undefined = undefined,
  const Children extends Routes = readonly [],
>(
  options: PathRouteOptions<Id, Path, Params, Search, Children>,
): PathRouteNode<Id, Path, Params, Search, Children> => {
  const paramsSchema = Schema.Struct(options.params)
  const decodeParams = Schema.decodeUnknownOption(paramsSchema)
  const encodeParams = Schema.encodeUnknownOption(paramsSchema)
  const decodeSearch = options.search === undefined
    ? (_input: unknown) => Option.some({})
    : Schema.decodeUnknownOption(options.search)
  const encodeSearch = options.search === undefined
    ? (_input: unknown) => Option.some({})
    : Schema.encodeUnknownOption(options.search)

  return {
    _tag: "PathRoute",
    ...options,
    children: options.children ?? [],
    decode: (params, search) => Option.flatMap(
      decodeParams(params),
      (decodedParams) => Option.map(decodeSearch(search), (decodedSearch) => ({
        params: decodedParams,
        search: decodedSearch,
        render: () => createElement(options.Component, {
          // Schema decoding is the runtime seam that proves these generic views.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          params: decodedParams as DecodedParams<Params>,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          search: decodedSearch as DecodedSearch<Search>,
        }),
      })),
    ),
    encode: (params, search) => Option.flatMap(
      encodeParams(params),
      (encodedParams) => Option.map(encodeSearch(search), (encodedSearch) => ({
        params: Object.fromEntries(
          Object.entries(encodedParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ),
        search: encodedSearchOf(encodedSearch),
      })),
    ),
  }
}

export const layout = <const Children extends Routes>(options: {
  readonly Layout: RouteComponent<{}>
  readonly children: Children
}): LayoutRouteNode<Children> => ({
    _tag: "LayoutRoute",
    ...options,
    decode: () => Option.some({
      params: {},
      search: {},
      render: () => createElement(options.Layout, {}),
    }),
    encode: () => Option.some({ params: {}, search: {} }),
})

type IndexRouteOptions<
  Id extends string | undefined,
  Search extends UrlSearchSchema | undefined,
> =
  & OptionalId<Id>
  & OptionalSearch<Search>
  & {
    readonly Component: RouteComponent<RouteComponentProps<{}, DecodedSearch<Search>>>
  }

export const index = <
  const Id extends string | undefined = undefined,
  const Search extends UrlSearchSchema | undefined = undefined,
>(options: IndexRouteOptions<Id, Search>): IndexRouteNode<Id, Search> => {
  const decodeSearch = options.search === undefined
    ? (_input: unknown) => Option.some({})
    : Schema.decodeUnknownOption(options.search)
  const encodeSearch = options.search === undefined
    ? (_input: unknown) => Option.some({})
    : Schema.encodeUnknownOption(options.search)
  return {
    _tag: "IndexRoute",
    index: true,
    ...options,
    children: [],
    decode: (_params, search) => Option.map(decodeSearch(search), (decodedSearch) => ({
      params: {},
      search: decodedSearch,
      render: () => createElement(options.Component, {
        params: {},
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        search: decodedSearch as DecodedSearch<Search>,
      }),
    })),
    encode: (_params, search) => Option.map(encodeSearch(search), (encodedSearch) => ({
      params: {},
      search: encodedSearchOf(encodedSearch),
    })),
  }
}

type MergeParams<
  Parent extends Readonly<Record<string, unknown>>,
  Local extends Readonly<Record<string, unknown>>,
> = Readonly<Parent & Local>

type DestinationFromNode<
  Node,
  ParentParams extends Readonly<Record<string, unknown>>,
> =
  Node extends ContractCarrier<
    infer Id,
    infer LocalParams,
    infer Search,
    infer Children
  >
    ? (
      | (Id extends string
        ? {
          readonly id: Id
          readonly params: MergeParams<ParentParams, LocalParams>
          readonly search: Search
        }
        : never)
      | DestinationFromRoutes<Children, MergeParams<ParentParams, LocalParams>>
    )
    : never

type DestinationFromRoutes<
  Nodes extends Routes,
  ParentParams extends Readonly<Record<string, unknown>> = {},
> = Nodes[number] extends infer Node ? DestinationFromNode<Node, ParentParams> : never

export type RouterDestination<Source extends Routes | Router<Routes>> =
  Source extends Router<infer Nodes>
    ? DestinationFromRoutes<Nodes>
    : Source extends Routes
      ? DestinationFromRoutes<Source>
      : never

export interface RouterFallbacks {
  readonly NotFound: RouteComponent<NotFoundProps>
  readonly InvalidUrl: RouteComponent<InvalidUrlProps>
  readonly Error: RouteComponent<RouterErrorProps>
}

export interface RouterHistory {
  readonly location: () => RouterLocation
  readonly push: (location: RouterLocation) => void
  readonly replace: (location: RouterLocation) => void
  readonly back: () => void
  readonly forward: () => void
  readonly listen: (listener: (location: RouterLocation) => void) => () => void
}

export const makeMemoryHistory = (
  initialLocation: RouterLocation,
): RouterHistory => {
  let entries: RouterLocation[] = [initialLocation]
  let cursor = 0
  const listeners = new Set<(location: RouterLocation) => void>()
  const notify = () => {
    const location = entries[cursor]
    if (location !== undefined) {
      for (const listener of listeners) listener(location)
    }
  }
  return {
    location: () => entries[cursor] ?? initialLocation,
    push: (location) => {
      entries = [...entries.slice(0, cursor + 1), location]
      cursor++
    },
    replace: (location) => {
      entries = entries.map((entry, indexValue) =>
        indexValue === cursor ? location : entry)
    },
    back: () => {
      if (cursor === 0) return
      cursor--
      notify()
    },
    forward: () => {
      if (cursor >= entries.length - 1) return
      cursor++
      notify()
    },
    listen: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export interface MatchedRouteEntry {
  readonly id?: string
  readonly params: Readonly<Record<string, unknown>>
  readonly search: unknown
  readonly render: () => ReactNode
}

export type RouterMatch =
  | {
      readonly _tag: "Matched"
      readonly entries: readonly MatchedRouteEntry[]
    }
  | {
      readonly _tag: "NotFound"
      readonly location: RouterLocation
    }
  | {
      readonly _tag: "InvalidUrl"
      readonly location: RouterLocation
      readonly issues: readonly unknown[]
    }

export class RouterNavigationError extends Data.TaggedError("RouterNavigationError")<{
  readonly cause: unknown
}> {}

type NavigationInput<Destination> = Destination extends {
  readonly id: infer Id extends string
  readonly params: infer Params extends Readonly<Record<string, unknown>>
  readonly search: infer Search
} ? {
    readonly id: Id
    readonly params: Params
    readonly search: Search
    readonly replace?: boolean
  } : never

export type RouterNavigation<Source extends Routes | Router<Routes>> =
  NavigationInput<RouterDestination<Source>>

export interface Router<Nodes extends Routes> {
  readonly routes: Nodes
  readonly fallbacks: RouterFallbacks
  readonly locationAtom: Atom.Writable<RouterLocation>
  readonly matchAtom: Atom.Atom<RouterMatch>
  readonly start: (registry: AtomRegistry.AtomRegistry, history: RouterHistory) => () => void
  readonly navigate: (
    destination: RouterNavigation<Router<Nodes>>,
  ) => Effect.Effect<void, RouterNavigationError>
  readonly navigateAtom: Atom.AtomResultFn<
    RouterNavigation<Router<Nodes>>,
    void,
    RouterNavigationError
  >
  readonly href: (destination: RouterNavigation<Router<Nodes>>) => string
  readonly pushSearch: (search: string) => Effect.Effect<void, RouterNavigationError>
  readonly replaceSearch: (search: string) => Effect.Effect<void, RouterNavigationError>
  readonly back: Effect.Effect<void, RouterNavigationError>
  readonly forward: Effect.Effect<void, RouterNavigationError>
  readonly location: () => RouterLocation
}

const RouterLocationSchema = Schema.Struct({
  pathname: Schema.String,
  search: Schema.String,
  hash: Schema.String,
})

const searchRecord = (searchValue: string): EncodedSearch => {
  const search = new URLSearchParams(searchValue)
  const output: Record<string, string | readonly string[]> = {}
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key)
    output[key] = values.length === 1 ? values[0] ?? "" : values
  }
  return output
}

const encodedSearchString = (search: EncodedSearch): string => {
  const output = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") output.set(key, value)
    else for (const item of value) output.append(key, item)
  }
  const encoded = output.toString()
  return encoded === "" ? "" : `?${encoded}`
}

type WalkResult =
  | { readonly _tag: "Matched"; readonly offset: number; readonly entries: readonly MatchedRouteEntry[] }
  | { readonly _tag: "Invalid"; readonly issues: readonly unknown[] }
  | { readonly _tag: "Miss" }

const pathSegments = (pathname: string): readonly string[] | undefined => {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent)
  } catch {
    return undefined
  }
}

const matchRoutes = (routes: Routes, location: RouterLocation): RouterMatch => {
  const segments = pathSegments(location.pathname)
  if (segments === undefined) {
    return { _tag: "InvalidUrl", location, issues: ["Malformed percent encoding"] }
  }
  const encodedSearch = searchRecord(location.search)

  const walkNodes = (
    nodes: Routes,
    offset: number,
  ): WalkResult => {
    const ordered = [...nodes].sort((left, right) => {
      if (left._tag === "PathRoute" && right._tag !== "PathRoute") return -1
      if (right._tag === "PathRoute" && left._tag !== "PathRoute") return 1
      return 0
    })

    for (const node of ordered) {
      if (node._tag === "IndexRoute") {
        if (offset !== segments.length) continue
        const decoded = node.decode({}, encodedSearch)
        if (Option.isNone(decoded)) return { _tag: "Invalid", issues: ["Invalid index search params"] }
        return {
          _tag: "Matched",
          offset,
          entries: [{ ...decoded.value, ...(node.id === undefined ? {} : { id: node.id }) }],
        }
      }

      if (node._tag === "LayoutRoute") {
        const child = walkNodes(node.children, offset)
        if (child._tag === "Miss") continue
        if (child._tag === "Invalid") return child
        const decoded = node.decode({}, encodedSearch)
        if (Option.isNone(decoded)) return { _tag: "Invalid", issues: ["Invalid layout"] }
        return {
          _tag: "Matched",
          offset: child.offset,
          entries: [decoded.value, ...child.entries],
        }
      }

      const pattern = (node.path ?? "").split("/").filter(Boolean)
      if (offset + pattern.length > segments.length) continue
      const rawParams: Record<string, string> = {}
      let matched = true
      for (let indexValue = 0; indexValue < pattern.length; indexValue++) {
        const expected = pattern[indexValue]
        const actual = segments[offset + indexValue]
        if (expected === undefined || actual === undefined) {
          matched = false
          break
        }
        if (expected.startsWith(":")) rawParams[expected.slice(1)] = actual
        else if (expected !== actual) {
          matched = false
          break
        }
      }
      if (!matched) continue

      const decoded = node.decode(rawParams, encodedSearch)
      if (Option.isNone(decoded)) {
        return { _tag: "Invalid", issues: [`Invalid params for ${node.path ?? ""}`] }
      }
      const nextOffset = offset + pattern.length
      const entry: MatchedRouteEntry = {
        ...decoded.value,
        ...(node.id === undefined ? {} : { id: node.id }),
      }
      if (node.children.length === 0) {
        if (nextOffset === segments.length) {
          return { _tag: "Matched", offset: nextOffset, entries: [entry] }
        }
        continue
      }
      const child = walkNodes(node.children, nextOffset)
      if (child._tag === "Invalid") return child
      if (child._tag === "Matched") {
        return {
          _tag: "Matched",
          offset: child.offset,
          entries: [entry, ...child.entries],
        }
      }
    }
    return { _tag: "Miss" }
  }

  const result = walkNodes(routes, 0)
  if (result._tag === "Invalid") {
    return { _tag: "InvalidUrl", location, issues: result.issues }
  }
  if (result._tag === "Miss" || result.offset !== segments.length) {
    return { _tag: "NotFound", location }
  }
  return { _tag: "Matched", entries: result.entries }
}

interface RouteRecord {
  readonly chain: readonly RouteNode[]
}

export const createRouter = <const Nodes extends Routes>(
  routes: Nodes,
  fallbacks: RouterFallbacks,
  options: {
    readonly initialLocation?: RouterLocation
    readonly snapshotKey?: string
  } = {},
): Router<Nodes> => {
  const initialLocation = options.initialLocation ?? {
    pathname: "/",
    search: "",
    hash: "",
  }
  const locationAtom = Atom.make<RouterLocation>(initialLocation).pipe(
    Atom.serializable({
      key: options.snapshotKey ?? "router/location",
      schema: RouterLocationSchema,
    }),
  )
  const matchAtom = Atom.make((get) => matchRoutes(routes, get(locationAtom)))
  const records = new Map<string, RouteRecord>()

  const visit = (nodes: Routes, chain: readonly RouteNode[]): void => {
    for (const node of nodes) {
      const nextChain = [...chain, node]
      if (node.id !== undefined) {
        if (records.has(node.id)) throw new Error(`Duplicate route id: ${node.id}`)
        records.set(node.id, { chain: nextChain })
      }
      visit(node.children, nextChain)
    }
  }
  visit(routes, [])

  let active:
    | {
        readonly registry: AtomRegistry.AtomRegistry
        readonly history: RouterHistory
        readonly cleanup: () => void
      }
    | undefined

  const currentLocation = (): RouterLocation =>
    active?.registry.get(locationAtom) ?? initialLocation

  const start = (registry: AtomRegistry.AtomRegistry, history: RouterHistory): (() => void) => {
    active?.cleanup()
    registry.set(locationAtom, history.location())
    const unlisten = history.listen((location) => registry.set(locationAtom, location))
    const cleanup = () => {
      unlisten()
      if (active?.registry === registry) active = undefined
    }
    active = { registry, history, cleanup }
    return cleanup
  }

  const requireActive = () => {
    if (active === undefined) throw new Error("Router has not been started")
    return active
  }

  const hrefFor = (destination: {
    readonly id: string
    readonly params: Readonly<Record<string, unknown>>
    readonly search: unknown
  }): string => {
    const record = records.get(destination.id)
    if (record === undefined) throw new Error(`Unknown route id: ${destination.id}`)
    const segments: string[] = []
    let encodedSearch: EncodedSearch = {}
    for (const node of record.chain) {
      if (node._tag === "LayoutRoute") continue
      const encoded = node.encode(destination.params, destination.search)
      if (Option.isNone(encoded)) throw new Error(`Cannot encode route: ${destination.id}`)
      if (node._tag === "PathRoute") {
        for (const segment of (node.path ?? "").split("/").filter(Boolean)) {
          if (segment.startsWith(":")) {
            const value = encoded.value.params[segment.slice(1)]
            if (value === undefined) throw new Error(`Missing route param: ${segment.slice(1)}`)
            segments.push(encodeURIComponent(value))
          } else {
            segments.push(encodeURIComponent(segment))
          }
        }
      }
      if (node.id === destination.id) encodedSearch = encoded.value.search
    }
    return `/${segments.join("/")}${encodedSearchString(encodedSearch)}`
  }

  const navigate = (
    destination: RouterNavigation<Router<Nodes>>,
  ): Effect.Effect<void, RouterNavigationError> => Effect.try({
    try: () => {
      const binding = requireActive()
      const url = new URL(hrefFor(destination), "https://effect-router.local")
      const location = {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
      }
      if (destination.replace === true) binding.history.replace(location)
      else binding.history.push(location)
      binding.registry.set(locationAtom, location)
    },
    catch: (cause) => new RouterNavigationError({ cause }),
  })

  const changeSearch = (
    operation: "push" | "replace",
    search: string,
  ): Effect.Effect<void, RouterNavigationError> => Effect.try({
    try: () => {
      const binding = requireActive()
      const current = binding.registry.get(locationAtom)
      const next = {
        ...current,
        search: search === "" || search.startsWith("?") ? search : `?${search}`,
      }
      binding.history[operation](next)
      binding.registry.set(locationAtom, next)
    },
    catch: (cause) => new RouterNavigationError({ cause }),
  })

  const historyOperation = (
    operation: "back" | "forward",
  ): Effect.Effect<void, RouterNavigationError> => Effect.try({
    try: () => requireActive().history[operation](),
    catch: (cause) => new RouterNavigationError({ cause }),
  })
  const navigateAtom = Atom.fn<RouterNavigation<Router<Nodes>>>()((destination) =>
    navigate(destination))

  return {
    routes,
    fallbacks,
    locationAtom,
    matchAtom,
    start,
    navigate,
    navigateAtom,
    href: hrefFor,
    pushSearch: (search) => changeSearch("push", search),
    replaceSearch: (search) => changeSearch("replace", search),
    back: historyOperation("back"),
    forward: historyOperation("forward"),
    location: currentLocation,
  }
}
