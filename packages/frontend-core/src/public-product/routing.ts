import { Locale } from "@proxus/product-messages"
import {
  compile,
  index,
  layout,
  makeRouterService,
  param,
  path,
  root,
  type DestinationOf,
  type MatchOf,
} from "../routing/index.js"

/** The product routes shared by Proxus clients. */
export const productRouteDefinition = root({
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
            layout({
              id: "public-only",
              children: [
                index({ id: "registration" }),
                path({ id: "login", path: "login" }),
                path({
                  id: "password-recovery-flow",
                  path: "password-recovery",
                  children: [
                    index({ id: "password-recovery" }),
                    path({ id: "password-recovery-code", path: "code" }),
                    path({ id: "new-password", path: "new-password" }),
                    path({ id: "password-updated", path: "done" }),
                  ],
                }),
              ],
            }),
            layout({
              id: "authenticated",
              children: [path({ id: "home", path: "app" })],
            }),
          ],
        }),
      ],
    }),
  ],
})

export const productRoutes = compile(productRouteDefinition)
export type ProductDestination = DestinationOf<typeof productRouteDefinition>
export type ProductRouteMatch = MatchOf<typeof productRouteDefinition>

/** Each application keeps a distinct Effect service identity while sharing the route contract. */
export const makeProductRouterService = (identifier: string) =>
  makeRouterService<ProductDestination, "locale", ProductRouteMatch>(identifier)
