import { makePublicWebProductComposition } from "@proxus/frontend-web/public-product"
import { Effect } from "effect"

export const composition = await Effect.runPromise(
  makePublicWebProductComposition({
    routerIdentifier: "@proxus/web/AppRouter",
  }),
)
