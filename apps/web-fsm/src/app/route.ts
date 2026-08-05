import type { AppModel, AppRoute } from "./model.js"

export const parseAppRoute = (location: Pick<Location, "pathname">): AppRoute => {
  const path = location.pathname.replace(/\/+$/, "") || "/"
  if (path === "/") return { _tag: "Root" }
  if (path === "/onboarding/registration") return { _tag: "Registration" }
  if (path === "/dashboard") return { _tag: "Dashboard" }
  return { _tag: "NotFound", path }
}

export const formatAppRoute = (route: AppRoute): string => {
  switch (route._tag) {
    case "Root": return "/"
    case "Registration": return "/onboarding/registration"
    case "Dashboard": return "/dashboard"
    case "NotFound": return route.path
  }
}

export const routeOf = (model: Exclude<AppModel, { readonly _tag: "Booting" }>): AppRoute => {
  switch (model._tag) {
    case "Onboarding": return { _tag: "Registration" }
    case "Dashboard": return { _tag: "Dashboard" }
    case "NotFound": return { _tag: "NotFound", path: model.path }
  }
}

export const routesEqual = (left: AppRoute, right: AppRoute): boolean =>
  formatAppRoute(left) === formatAppRoute(right)
