import { useAtomSet } from "@effect/atom-react"
import type { ProductDestination } from "@proxus/frontend-core/public-product"
import { Effect } from "effect"
import { Router, routerRuntime } from "./router.js"

const navigateBinding = routerRuntime.fn((id: ProductDestination["id"]) =>
  Effect.gen(function*() {
    const router = yield* Router
    yield* router.navigate(id)
  }))

/** React binding for routes that have no caller-supplied path or query input. */
export const useRouter = () => ({
  navigate: useAtomSet(navigateBinding),
})
