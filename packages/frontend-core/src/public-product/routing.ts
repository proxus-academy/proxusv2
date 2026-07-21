import { Locale } from "@proxus/product-messages"
import { compile, index, makeRouterService, param, root, type DestinationOf } from "../routing/index.js"

/** The product routes shared by every public Proxus client. */
export const publicProductRouteDefinition = root({
  id: "root",
  children: [
    param({
      id: "locale",
      name: "locale",
      schema: Locale,
      children: [index({ id: "registration" })],
    }),
  ],
})

export const publicProductRoutes = compile(publicProductRouteDefinition)

export type PublicProductDestination = DestinationOf<
  typeof publicProductRouteDefinition
>

/** Each application keeps a distinct Effect service identity while sharing the route contract. */
export const makePublicProductRouterService = (identifier: string) =>
  makeRouterService<PublicProductDestination>(identifier)
