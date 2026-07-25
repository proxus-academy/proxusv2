import { Locale } from "@proxus/product-messages"
import { compile, index, layout, makeRouterService, param, path, root, type DestinationOf } from "../routing/index.js"

/** The product routes shared by every public Proxus client. */
export const publicProductRouteDefinition = root({
  id: "root",
  children: [
    param({
      id: "locale",
      name: "locale",
      schema: Locale,
      children: [
        layout({
          id: "product",
          children: [
            index({ id: "registration" }),
            path({ id: "login", path: "login" }),
            path({
              id: "password-recovery-layout",
              path: "password-recovery",
              children: [
                index({ id: "password-recovery" }),
                path({ id: "password-recovery-code", path: "code" }),
                path({ id: "new-password", path: "new-password" }),
                path({ id: "password-updated", path: "done" }),
              ],
            }),
            path({ id: "home", path: "app" }),
          ],
        }),
      ],
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
