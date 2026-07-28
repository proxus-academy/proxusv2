import {
  type DecodedRoute,
  makeObservableValue,
  NavigationError,
  type NavigationOptions,
  type RouteDestination,
  type RouteEncodingError,
  type RouteParams,
  type RouteQuery,
  type RouteNotFound,
  type RouteMatch,
  type RouterCommandError,
  type RouterIdentifier,
  type RouterLocation,
  type RouterObservableError,
  type RouterService,
  type RouterTag,
  type RouterLayerOptions,
} from "@proxus/frontend-core/routing"
import { Effect, Layer, Queue, type Schema, Stream } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export interface BrowserNavigation {
  readonly currentUrl: () => URL
  readonly state: () => unknown
  readonly pushState: (state: unknown, url: URL) => void
  readonly replaceState: (state: unknown, url: URL) => void
  readonly back: () => void
  readonly forward: () => void
  readonly onPopState: (listener: () => void) => () => void
}

export const browserNavigation = (): BrowserNavigation => ({
  currentUrl: () => new URL(window.location.href),
  state: () => window.history.state,
  pushState: (state, url) => window.history.pushState(state, "", url),
  replaceState: (state, url) => window.history.replaceState(state, "", url),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  onPopState: (listener) => {
    window.addEventListener("popstate", listener)
    return () => window.removeEventListener("popstate", listener)
  },
})

interface BrowserRoutes<Destination extends RouteDestination, Match extends RouteMatch = RouteMatch> {
  readonly encodeDestination: (
    destination: Destination,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly encodeQuery: (
    destination: Destination,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly withQuery: (
    destination: Destination,
    search: string,
  ) => Effect.Effect<Destination, Schema.SchemaError | RouteEncodingError>
  readonly makeDestination: (id: string, path: RouteParams, query: RouteQuery) => Destination
  readonly decode: (pathname: string) => Effect.Effect<DecodedRoute<Destination, Match>, RouteNotFound>
  readonly matchDestination: (
    destination: Destination,
  ) => Effect.Effect<readonly Match[], Schema.SchemaError | RouteEncodingError | RouteNotFound>
}

export interface BrowserRouterOptions<
  Destination extends RouteDestination,
  ContextKey extends string = never,
> extends RouterLayerOptions<ContextKey> {
  readonly notFound: (pathname: string) => Destination
  readonly navigation?: BrowserNavigation
}

interface BrowserRouterState<Destination extends RouteDestination, Match extends RouteMatch = RouteMatch> {
  readonly location: RouterLocation<Destination, Match>
  readonly error: RouterObservableError | undefined
}

const navigationFailure = (
  operation: NavigationError["operation"],
  error: unknown,
) => new NavigationError({
  operation,
  message: error instanceof globalThis.Error
    ? error.message
    : "Browser history operation failed",
})

export const browserRouterLayer = <
  Destination extends RouteDestination,
  ContextKey extends keyof Destination["params"] & string = never,
  Match extends RouteMatch = RouteMatch,
>(
  routerTag: RouterTag<NoInfer<Destination>, ContextKey, Match>,
  routes: BrowserRoutes<Destination, Match>,
  options: BrowserRouterOptions<Destination, ContextKey>,
): Layer.Layer<
  RouterIdentifier<Destination, ContextKey>,
  Schema.SchemaError | RouteEncodingError | RouteNotFound
> =>
  Layer.effect(routerTag, Effect.gen(function*() {
    const navigation = options.navigation ?? browserNavigation()
    const resolve = (
      url: URL,
    ): Effect.Effect<
      BrowserRouterState<Destination, Match>,
      Schema.SchemaError | RouteEncodingError | RouteNotFound
    > => {
      const search = url.search.slice(1)
      return routes.decode(url.pathname).pipe(
        Effect.flatMap((decoded) => routes.withQuery(decoded.destination, search).pipe(
          Effect.map((destination) => ({ ...decoded, destination })),
        )),
        Effect.map((decoded): BrowserRouterState<Destination, Match> => ({
          location: { destination: decoded.destination, matches: decoded.matches, search },
          error: undefined,
        })),
        Effect.catch((routeError) => Effect.gen(function*() {
          const destination = options.notFound(url.pathname)
          const matches = yield* routes.matchDestination(destination)
          return {
            location: {
              destination,
              matches,
              search,
            },
            error: routeError,
          }
        })),
      )
    }

    const state = makeObservableValue(yield* resolve(navigation.currentUrl()))
    const current = Atom.map(state.atom, ({ location }) => location.destination)
    const location = Atom.map(state.atom, ({ location }) => location)
    const error = Atom.map(state.atom, ({ error }) => error)
    const setError = (nextError: RouterObservableError | undefined) => Effect.sync(() => {
      state.set({ ...state.get(), error: nextError })
    })
    const refresh = (url: URL) => resolve(url).pipe(
      Effect.tap((next) => Effect.sync(() => state.set(next))),
      Effect.asVoid,
    )

    const transitions = yield* Effect.acquireRelease(
      Queue.sliding<URL>(1),
      Queue.shutdown,
    )
    yield* Stream.fromQueue(transitions).pipe(
      Stream.switchMap((url) => Stream.fromEffect(refresh(url))),
      Stream.runDrain,
      Effect.forkScoped,
    )
    yield* Effect.acquireRelease(
      Effect.sync(() => navigation.onPopState(() => {
        Queue.offerUnsafe(transitions, navigation.currentUrl())
      })),
      (unsubscribe) => Effect.sync(unsubscribe),
    )

    const change = (
      operation: "push" | "replace",
      destination: Destination,
      navigationOptions?: NavigationOptions,
    ): Effect.Effect<void, RouterCommandError> =>
      routes.matchDestination(destination).pipe(
        Effect.flatMap((matches) => routes.encodeDestination(destination).pipe(
          Effect.map((pathname) => ({ pathname, matches })),
        )),
        Effect.flatMap(({ pathname, matches }) => Effect.try({
          try: () => {
            const url = navigation.currentUrl()
            url.pathname = pathname
            if (navigationOptions?.search !== undefined) {
              url.search = navigationOptions.search.length === 0 ? "" : `?${navigationOptions.search}`
            }
            if (operation === "push") navigation.pushState(navigation.state(), url)
            else navigation.replaceState(navigation.state(), url)
            state.set({
              location: { destination, matches, search: url.search.slice(1) },
              error: undefined,
            })
          },
          catch: (cause) => navigationFailure(operation, cause),
        })),
        Effect.tapError((failure) => setError(failure)),
      )

    const changeRoute = (
      operation: "push" | "replace",
      id: string,
      input?: { readonly path?: RouteParams; readonly query?: RouteQuery },
    ) => Effect.gen(function*() {
      const currentParams = state.get().location.destination.params
      const context = Object.fromEntries(
        (options.contextParameters ?? []).map((key) => [key, currentParams[key]]),
      )
      const destination = routes.makeDestination(
        id,
        { ...context, ...input?.path },
        input?.query ?? {},
      )
      const search = yield* routes.encodeQuery(destination)
      yield* change(operation, destination, { search })
    })

    const historyOperation = (
      operation: "back" | "forward",
      run: () => void,
    ): Effect.Effect<void, NavigationError> => Effect.try({
      try: run,
      catch: (cause) => navigationFailure(operation, cause),
    }).pipe(
      Effect.tap(() => setError(undefined)),
      Effect.tapError((failure) => setError(failure)),
    )

    const service: RouterService<Destination, ContextKey, Match> = {
      current,
      location,
      error,
      navigate: (id, ...input) => changeRoute("push", id, input[0]),
      replace: (id, ...input) => changeRoute("replace", id, input[0]),
      pushDestination: (destination, navigationOptions) => change("push", destination, navigationOptions),
      replaceDestination: (destination, navigationOptions) => change("replace", destination, navigationOptions),
      back: historyOperation("back", navigation.back),
      forward: historyOperation("forward", navigation.forward),
    }
    return routerTag.of(service)
  }))
