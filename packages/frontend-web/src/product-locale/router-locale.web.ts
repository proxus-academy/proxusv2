import type { RetryableCommandRunner } from "@proxus/frontend-core/navigation"
import { makeProductLocaleAtoms } from "@proxus/frontend-core/product-locale"
import {
  type DecodedRoute,
  type RouteDestination,
  type RouteEncodingError,
  type RouteNotFound,
  type RouterCommandError,
  type RouterLocation,
  type RouterService,
} from "@proxus/frontend-core/routing"
import { Locale, type Locale as LocaleType } from "@proxus/product-messages"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

export type LocalizedDestination = RouteDestination<
  string,
  { readonly locale: LocaleType }
>

export interface LocalizedRoutes<Destination extends LocalizedDestination> {
  readonly decode: (
    pathname: string,
  ) => Effect.Effect<DecodedRoute<Destination>, RouteNotFound>
  readonly encodeDestination: (
    destination: Destination,
  ) => Effect.Effect<string, Schema.SchemaError | RouteEncodingError>
}

export interface CanonicalLocalePlan<Destination extends LocalizedDestination> {
  readonly destination: Destination
  readonly locale: LocaleType
  readonly url: URL
  readonly shouldReplace: boolean
}

/** Resolves path, legacy query, preference, then device (inside the supplied preference). */
export const canonicalLocalePlan = <Destination extends LocalizedDestination>(input: {
  readonly url: URL
  readonly routes: LocalizedRoutes<Destination>
  readonly destination: (locale: LocaleType) => Destination
  readonly preferredLocale: LocaleType
}): Effect.Effect<
  CanonicalLocalePlan<Destination>,
  Schema.SchemaError | RouteEncodingError
> => Effect.gen(function*() {
  const decodedPath = yield* Effect.option(input.routes.decode(input.url.pathname))
  const pathLocale = Option.flatMap(
    decodedPath,
    (decoded) => Schema.decodeUnknownOption(Locale)(decoded.destination.params.locale),
  )
  const search = new URLSearchParams(input.url.search)
  const queryLocale = Schema.decodeUnknownOption(Locale)(search.get("lang"))
  const locale = Option.getOrElse(
    pathLocale,
    () => Option.getOrElse(queryLocale, () => input.preferredLocale),
  )
  const destination = input.destination(locale)
  const pathname = yield* input.routes.encodeDestination(destination)

  search.delete("lang")
  const url = new URL(input.url.href)
  url.pathname = pathname
  const encodedSearch = search.toString()
  url.search = encodedSearch.length === 0 ? "" : `?${encodedSearch}`

  return {
    destination,
    locale,
    url,
    shouldReplace: input.url.pathname !== url.pathname || input.url.search !== url.search,
  }
})

export const makeCanonicalLocaleAtoms = <Destination extends LocalizedDestination>(options: {
  readonly router: RouterService<Destination>
  readonly routes: LocalizedRoutes<Destination>
  readonly destination: (locale: LocaleType) => Destination
  readonly preferredLocale: () => LocaleType
  readonly applyDocumentLocale: (locale: LocaleType) => void
  readonly runner: RetryableCommandRunner
  readonly currentUrl?: () => URL
}) => {
  const canonicalizeLocale = Effect.fn("BrowserProductLocale.canonicalize")(function*(input: {
    readonly url: URL
    readonly preferredLocale: LocaleType
  }) {
    const plan = yield* canonicalLocalePlan({
      url: input.url,
      routes: options.routes,
      destination: options.destination,
      preferredLocale: input.preferredLocale,
    })
    if (plan.shouldReplace) {
      yield* options.router.replace(plan.destination, { search: plan.url.search.slice(1) })
    }
    options.applyDocumentLocale(plan.locale)
    return plan.locale
  })
  const canonicalizeLocaleAtom = Atom.fn((_input: void, get) => options.runner.run(
    get,
    canonicalizeLocale({
      url: (options.currentUrl ?? (() => new URL(window.location.href)))(),
      preferredLocale: options.preferredLocale(),
    }),
  ))
  const lifecycleRuntime = Atom.runtime(Layer.empty)
  const localeLifecycleAtom = lifecycleRuntime.atom(Effect.gen(function*() {
    const registry = yield* AtomRegistry.AtomRegistry
    return yield* AtomRegistry.toStream(registry, options.router.location).pipe(
      Stream.mapEffect(() => {
        registry.set(canonicalizeLocaleAtom, undefined)
        return AtomRegistry.getResult(
          registry,
          canonicalizeLocaleAtom,
          { suspendOnWaiting: true },
        ).pipe(Effect.ignore)
      }),
      Stream.runDrain,
    )
  })).pipe(Atom.setIdleTTL(0))

  return { canonicalizeLocaleAtom, localeLifecycleAtom }
}

export const makeRouterProductLocaleAtoms = <Destination extends LocalizedDestination>(options: {
  readonly router: RouterService<Destination>
  readonly destination: (locale: LocaleType) => Destination
  readonly deviceLocale: () => LocaleType
  readonly persistLocale: (locale: LocaleType) => void
  readonly clearLocalePreference: () => void
  readonly applyDocumentLocale: (locale: LocaleType) => void
  readonly runner: RetryableCommandRunner
}) => {
  const localeAtom = Atom.map(
    options.router.current,
    (destination) => destination.params.locale,
  )
  const replaceLocale = Effect.fn("BrowserProductLocale.replace")(function*(input: {
    readonly locale: LocaleType
    readonly location: RouterLocation<Destination>
    readonly preference: "persist" | "device"
  }): Effect.fn.Return<void, RouterCommandError> {
    yield* options.router.replace(
      options.destination(input.locale),
      { search: input.location.search },
    )
    if (input.preference === "persist") options.persistLocale(input.locale)
    else options.clearLocalePreference()
    options.applyDocumentLocale(input.locale)
  })

  const locale = makeProductLocaleAtoms({
    localeAtom,
    replaceLocale: (nextLocale, get) => replaceLocale({
      locale: nextLocale,
      location: get(options.router.location),
      preference: "persist",
    }),
  }, options.runner)
  const useDeviceLocaleAtom = Atom.fn((_input: void, get) => options.runner.run(get, replaceLocale({
    locale: options.deviceLocale(),
    location: get(options.router.location),
    preference: "device",
  })))

  return { ...locale, useDeviceLocaleAtom }
}
