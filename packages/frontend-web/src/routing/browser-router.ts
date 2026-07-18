import {
  type DecodedRoute,
  NavigationError,
  type RouteDestination,
  type RouteEncodingError,
  type RouteNotFound,
  type RouterIdentifier,
  type RouterService,
  type RouterTag,
} from "@proxus/frontend-core/routing"
import { Effect, Layer, type Schema } from "effect"
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
    set: (destination: Destination) => {
      current = destination
      listeners.forEach((listener) => listener())
    },
  }
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
        Effect.map((decoded) => decoded.destination),
        Effect.catchTag("RouteNotFound", () =>
          Effect.succeed(options.notFound(pathname))),
      )

    const initial = yield* resolve(navigation.currentUrl().pathname)
    const current = makeCurrentRoute(initial)
    const refresh = Effect.suspend(() =>
      resolve(navigation.currentUrl().pathname).pipe(
        Effect.tap((destination) => Effect.sync(() => current.set(destination))),
      ))

    const context = yield* Effect.context<never>()
    yield* Effect.acquireRelease(
      Effect.sync(() => navigation.onPopState(() => {
        Effect.runSyncWith(context)(refresh)
      })),
      (unsubscribe) => Effect.sync(unsubscribe),
    )

    const change = (
      operation: "push" | "replace",
      destination: Destination,
    ): Effect.Effect<void, NavigationError> =>
      routes.encodeDestination(destination).pipe(
        Effect.mapError((error) =>
          navigationFailure(operation, new globalThis.Error(String(error)))),
        Effect.flatMap((pathname) => Effect.try({
          try: () => {
            const url = navigation.currentUrl()
            url.pathname = pathname
            if (operation === "push") navigation.pushState(navigation.state(), url)
            else navigation.replaceState(navigation.state(), url)
            current.set(destination)
          },
          catch: (error) => navigationFailure(
            operation,
            error instanceof globalThis.Error
              ? error
              : new globalThis.Error("Browser history operation failed"),
          ),
        })),
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
      push: (destination) => change("push", destination),
      replace: (destination) => change("replace", destination),
      back: historyOperation("back", navigation.back),
      forward: historyOperation("forward", navigation.forward),
    }
    return routerTag.of(service)
  }))
