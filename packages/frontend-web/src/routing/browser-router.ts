import {
  type DecodedRoute,
  makeObservableValue,
  NavigationError,
  type NavigationOptions,
  type RouteDestination,
  type RouteEncodingError,
  type RouteNotFound,
  type RouterCommandError,
  type RouterIdentifier,
  type RouterLocation,
  type RouterObservableError,
  type RouterService,
  type RouterTag,
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

interface BrowserRoutes<Destination extends RouteDestination> {
  readonly encodeDestination: (
    destination: Destination,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
  readonly decode: (
    pathname: string,
  ) => Effect.Effect<DecodedRoute<Destination>, RouteNotFound>
}

export interface BrowserRouterOptions<Destination extends RouteDestination> {
  readonly notFound: (pathname: string) => Destination
  readonly navigation?: BrowserNavigation
}

interface BrowserRouterState<Destination extends RouteDestination> {
  readonly location: RouterLocation<Destination>
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

export const browserRouterLayer = <Destination extends RouteDestination>(
  routerTag: RouterTag<Destination>,
  routes: BrowserRoutes<Destination>,
  options: BrowserRouterOptions<Destination>,
): Layer.Layer<RouterIdentifier<Destination>> =>
  Layer.effect(routerTag, Effect.gen(function*() {
    const navigation = options.navigation ?? browserNavigation()
    const resolve = (url: URL): Effect.Effect<BrowserRouterState<Destination>> =>
      routes.decode(url.pathname).pipe(
        Effect.map((decoded): BrowserRouterState<Destination> => ({
          location: {
            destination: decoded.destination,
            search: url.search.slice(1),
          },
          error: undefined,
        })),
        Effect.catchTag("RouteNotFound", (routeError) => Effect.succeed<BrowserRouterState<Destination>>({
          location: {
            destination: options.notFound(url.pathname),
            search: url.search.slice(1),
          },
          error: routeError,
        })),
      )

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
      routes.encodeDestination(destination).pipe(
        Effect.flatMap((pathname) => Effect.try({
          try: () => {
            const url = navigation.currentUrl()
            url.pathname = pathname
            if (navigationOptions?.search !== undefined) {
              url.search = navigationOptions.search.length === 0 ? "" : `?${navigationOptions.search}`
            }
            if (operation === "push") navigation.pushState(navigation.state(), url)
            else navigation.replaceState(navigation.state(), url)
            state.set({
              location: { destination, search: url.search.slice(1) },
              error: undefined,
            })
          },
          catch: (cause) => navigationFailure(operation, cause),
        })),
        Effect.tapError((failure) => setError(failure)),
      )

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

    const service: RouterService<Destination> = {
      current,
      location,
      error,
      push: (destination, navigationOptions) => change("push", destination, navigationOptions),
      replace: (destination, navigationOptions) => change("replace", destination, navigationOptions),
      back: historyOperation("back", navigation.back),
      forward: historyOperation("forward", navigation.forward),
    }
    return routerTag.of(service)
  }))
