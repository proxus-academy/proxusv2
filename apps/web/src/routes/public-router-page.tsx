import { useAtomValue } from "@effect/atom-react"
import { Match } from "effect"
import { HomePage } from "../pages/home-page.js"
import { LoginPage } from "../pages/auth/login-page.js"
import { NewPasswordPage } from "../pages/auth/new-password-page.js"
import { PasswordRecoveryPage } from "../pages/auth/password-recovery-page.js"
import { PasswordUpdatedPage } from "../pages/auth/password-updated-page.js"
import { RecoveryCodePage } from "../pages/auth/recovery-code-page.js"
import { RegistrationPage } from "../pages/registration/registration-page.js"
import { AuthenticatedLayout, PublicOnlyLayout } from "./auth-layouts.js"
import { currentRouteAtom } from "./public-router.js"

/** Maps the validated terminal route to its page and access layout. */
export function PublicRouterPage() {
  const page = useAtomValue(currentRouteAtom)
  return Match.value(page).pipe(
    Match.when("home", () => <AuthenticatedLayout><HomePage /></AuthenticatedLayout>),
    Match.orElse((publicPage) => (
      <PublicOnlyLayout>
        {Match.value(publicPage).pipe(
          Match.when("registration", () => <RegistrationPage />),
          Match.when("login", () => <LoginPage />),
          Match.when("password-recovery", () => <PasswordRecoveryPage />),
          Match.when("password-recovery-code", () => <RecoveryCodePage />),
          Match.when("new-password", () => <NewPasswordPage />),
          Match.when("password-updated", () => <PasswordUpdatedPage />),
          Match.exhaustive,
        )}
      </PublicOnlyLayout>
    )),
  )
}
