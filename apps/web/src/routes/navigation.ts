import { Locale, type Locale as LocaleType } from "@proxus/product-messages"
import { Data, Effect, Option, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { router } from "./router.js"

export class WebNavigationError extends Data.TaggedError("WebNavigationError")<{
  readonly cause: unknown
}> {}

export type NavigationDestination = (
  | { readonly id: "registration" }
  | { readonly id: "login" }
  | { readonly id: "password-recovery" }
  | { readonly id: "password-recovery-code" }
  | { readonly id: "new-password" }
  | { readonly id: "password-updated" }
  | { readonly id: "home" }
) & { readonly replace?: boolean }

export const currentLocale = (): LocaleType => {
  const segment = router.state.location.pathname.split("/")[1]
  return Option.getOrElse(
    Schema.decodeUnknownOption(Locale)(segment),
    () => "es" as const,
  )
}

const navigatePromise = (run: () => Promise<void>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new WebNavigationError({ cause }),
  })

export const navigate = (
  destination: NavigationDestination,
): Effect.Effect<void, WebNavigationError> => {
  const locale = currentLocale()
  const replace = destination.replace ?? false
  switch (destination.id) {
    case "registration":
      return navigatePromise(() => router.navigate({ to: "/$locale", params: { locale }, search: {}, replace }))
    case "login":
      return navigatePromise(() => router.navigate({ to: "/$locale/login", params: { locale }, search: {}, replace }))
    case "password-recovery":
      return navigatePromise(() => router.navigate({ to: "/$locale/password-recovery", params: { locale }, search: {}, replace }))
    case "password-recovery-code":
      return navigatePromise(() => router.navigate({ to: "/$locale/password-recovery/code", params: { locale }, search: {}, replace }))
    case "new-password":
      return navigatePromise(() => router.navigate({ to: "/$locale/password-recovery/new-password", params: { locale }, search: {}, replace }))
    case "password-updated":
      return navigatePromise(() => router.navigate({ to: "/$locale/password-recovery/done", params: { locale }, search: {}, replace }))
    case "home":
      return navigatePromise(() => router.navigate({ to: "/$locale/app", params: { locale }, search: {}, replace }))
  }
}

export const navigateAction = Atom.fn<NavigationDestination>()((destination) =>
  navigate(destination))

export const currentSearch = (): URLSearchParams =>
  new URLSearchParams(router.state.location.searchStr)

export const setSearch = (
  operation: "push" | "replace",
  search: URLSearchParams,
): Effect.Effect<void, WebNavigationError> =>
  navigatePromise(() => router.navigate({
    href: `${router.state.location.pathname}${search.size === 0 ? "" : `?${search.toString()}`}`,
    replace: operation === "replace",
  }))

export const replaceSearch = (
  search: Record<string, unknown>,
): Effect.Effect<void, WebNavigationError> => {
  const encoded = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") encoded.set(key, value)
  }
  return setSearch("replace", encoded)
}
