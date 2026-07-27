import { useAtomSet } from "@effect/atom-react"
import type { PublicProductDestination } from "@proxus/frontend-core/public-product"
import { Effect } from "effect"
import { PublicRouter, publicRouterRuntime } from "./public-router.js"

const navigateBinding = publicRouterRuntime.fn((id: PublicProductDestination["id"]) =>
  Effect.gen(function*() {
    const router = yield* PublicRouter
    yield* router.navigate(id)
  }))

/** React binding for routes that have no caller-supplied path or query input. */
export const usePublicRouter = () => ({
  navigate: useAtomSet(navigateBinding),
})
