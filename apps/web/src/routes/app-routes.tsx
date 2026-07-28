import { useAtomValue } from "@effect/atom-react"
import type {
  ProductDestination,
  ProductRouteMatch,
} from "@proxus/frontend-core/public-product"
import { Match } from "effect"
import type { ReactNode } from "react"
import { AuthenticatedLayout, PublicOnlyLayout } from "../modules/auth/layouts.js"
import { HomePage } from "../pages/home-page.js"
import { LoginPage } from "../pages/auth/login-page.js"
import { NewPasswordPage } from "../pages/auth/new-password-page.js"
import { PasswordRecoveryPage } from "../pages/auth/password-recovery-page.js"
import { PasswordUpdatedPage } from "../pages/auth/password-updated-page.js"
import { RecoveryCodePage } from "../pages/auth/recovery-code-page.js"
import { RegistrationPage } from "../pages/registration/registration-page.js"
import { routeLocationAtom } from "./router.js"

const renderTerminal = (destination: ProductDestination): ReactNode =>
  Match.value(destination).pipe(
    Match.when({ id: "registration" }, () => <RegistrationPage />),
    Match.when({ id: "login" }, () => <LoginPage />),
    Match.when({ id: "password-recovery" }, () => <PasswordRecoveryPage />),
    Match.when({ id: "password-recovery-code" }, () => <RecoveryCodePage />),
    Match.when({ id: "new-password" }, () => <NewPasswordPage />),
    Match.when({ id: "password-updated" }, () => <PasswordUpdatedPage />),
    Match.when({ id: "home" }, () => <HomePage />),
    Match.exhaustive,
  )

const applyLayout = (match: ProductRouteMatch, children: ReactNode): ReactNode => {
  switch (match.id) {
    case "public-only":
      return <PublicOnlyLayout>{children}</PublicOnlyLayout>
    case "authenticated":
      return <AuthenticatedLayout>{children}</AuthenticatedLayout>
    default:
      return children
  }
}

export function AppRoutes() {
  const location = useAtomValue(routeLocationAtom)
  return location.matches.reduceRight<ReactNode>(
    (children, match) => applyLayout(match, children),
    renderTerminal(location.destination),
  )
}
