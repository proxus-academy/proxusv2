import {
  type DecodedRoute,
  NavigationError,
  type RouteDestination,
  type RouteEncodingError,
  type RouteNotFound,
  makeObservableValue,
  type RouterIdentifier,
  type RouterObservableError,
  type RouterService,
  type RouterTag,
} from "@proxus/frontend-core/routing"
import { Effect, Fiber, Layer, type Schema } from "effect"

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

const navigationFailure = (
  operation: NavigationError["operation"],
  error: globalThis.Error,
) => new NavigationError({ operation, message: error.message })

export const browserRouterLayer = <Destination extends RouteDestination>(
  routerTag: RouterTag<Destination>,
  routes: BrowserRoutes<Destination>,
  options: BrowserRouterOptions<Destination>,
): Layer.Layer<RouterIdentifier<Destination>> =>
  Layer.effect(routerTag, Effect.gen(function*() {
    const navigation = options.navigation ?? browserNavigation()
    const resolve = (pathname: string) =>
      routes.decode(pathname).pipe(
        Effect.map((decoded) => ({ destination: decoded.destination, error: undefined } as const)),
        Effect.catchTag("RouteNotFound", (routeError) => Effect.succeed({
          destination: options.notFound(pathname),
          error: routeError as RouterObservableError,
        } as const)),
      )

    const initial = yield* resolve(navigation.currentUrl().pathname)
    const current = makeObservableValue(initial.destination)
    const error = makeObservableValue<RouterObservableError | undefined>(initial.error)
    const refresh = Effect.suspend(() => resolve(navigation.currentUrl().pathname)).pipe(
      Effect.tap((result) => Effect.sync(() => {
        current.set(result.destination)
        error.set(result.error)
      })),
    )

    const context = yield* Effect.context<never>()
    let active: ReturnType<typeof Effect.runFork> | undefined
    yield* Effect.acquireRelease(
      Effect.sync(() => navigation.onPopState(() => {
        if (active !== undefined) Effect.runForkWith(context)(Fiber.interrupt(active))
        active = Effect.runForkWith(context)(refresh)
      })),
      (unsubscribe) => Effect.sync(() => {
        unsubscribe()
        if (active !== undefined) Effect.runForkWith(context)(Fiber.interrupt(active))
      }),
    )

    const change = (
      operation: "push" | "replace",
      destination: Destination,
    ): Effect.Effect<void, NavigationError> =>
      routes.encodeDestination(destination).pipe(
        Effect.mapError((cause) =>
          navigationFailure(operation, new globalThis.Error(String(cause)))),
        Effect.flatMap((pathname) => Effect.try({
          try: () => {
            const url = navigation.currentUrl()
            url.pathname = pathname
            if (operation === "push") navigation.pushState(navigation.state(), url)
            else navigation.replaceState(navigation.state(), url)
            current.set(destination)
            error.set(undefined)
          },
          catch: (error) => navigationFailure(
            operation,
            error instanceof globalThis.Error
              ? error
              : new globalThis.Error("Browser history operation failed"),
          ),
        })),
        Effect.tapError((failure) => Effect.sync(() => error.set(failure))),
      )

    const historyOperation = (
      operation: "back" | "forward",
      run: () => void,
    ): Effect.Effect<void, NavigationError> => Effect.try({
      try: run,
      catch: (error) => navigationFailure(
        operation,
        error instanceof globalThis.Error
          ? error
          : new globalThis.Error("Browser history operation failed"),
      ),
    })

    const service: RouterService<Destination> = {
      current: current.atom,
      error: error.atom,
      push: (destination) => change("push", destination),
      replace: (destination) => change("replace", destination),
      back: historyOperation("back", navigation.back),
      forward: historyOperation("forward", navigation.forward),
    }
    return routerTag.of(service)
  }))
