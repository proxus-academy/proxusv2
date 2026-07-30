import type { RouterNavigationError } from "@proxus/effect-router"
import { Locale, type Locale as LocaleType } from "@proxus/product-messages"
import { Effect, Option, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { router } from "./router.js"

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
  const segment = router.location().pathname.split("/")[1]
  return Option.getOrElse(
    Schema.decodeUnknownOption(Locale)(segment),
    () => "es" as const,
  )
}

export const navigate = (
  destination: NavigationDestination,
): Effect.Effect<void, RouterNavigationError> => {
  const params = { locale: currentLocale() }
  const common = {
    params,
    search: {},
    ...(destination.replace === undefined ? {} : { replace: destination.replace }),
  }
  switch (destination.id) {
    case "registration": return router.navigate({ id: "registration", ...common })
    case "login": return router.navigate({ id: "login", ...common })
    case "password-recovery": return router.navigate({ id: "password-recovery", ...common })
    case "password-recovery-code": return router.navigate({ id: "password-recovery-code", ...common })
    case "new-password": return router.navigate({ id: "new-password", ...common })
    case "password-updated": return router.navigate({ id: "password-updated", ...common })
    case "home": return router.navigate({ id: "home", ...common })
  }
}

export const navigateAction = Atom.fn<NavigationDestination>()((destination) =>
  navigate(destination))

export const replaceSearch = (
  search: Record<string, unknown>,
): Effect.Effect<void, RouterNavigationError> => {
  const encoded = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") encoded.set(key, value)
  }
  return router.replaceSearch(encoded.toString())
}
