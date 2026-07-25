import { useAtomValue } from "@effect/atom-react"
import { Match } from "effect"
import { composition } from "../composition.js"
import { AuthenticatedLayout, PublicOnlyLayout } from "./auth/auth-layouts.js"
import { AuthenticatedScreen } from "./auth/authenticated-screen.js"
import { LoginPage } from "./auth/login-page.js"
import { NewPasswordPage } from "./auth/new-password-page.js"
import { PasswordRecoveryPage } from "./auth/password-recovery-page.js"
import { PasswordUpdatedPage } from "./auth/password-updated-page.js"
import { RecoveryCodePage } from "./auth/recovery-code-page.js"
import { RegistrationScreen } from "./registration/registration-screen.js"

/** Renders the terminal typed route through its access layout. */
export function PublicRouterPage() {
  const page = useAtomValue(composition.currentPageAtom)
  return Match.value(page).pipe(
    Match.when("home", () => <AuthenticatedLayout><AuthenticatedScreen /></AuthenticatedLayout>),
    Match.orElse((publicPage) => <PublicOnlyLayout>{Match.value(publicPage).pipe(
      Match.when("registration", () => <RegistrationScreen />),
      Match.when("login", () => <LoginPage />),
      Match.when("password-recovery", () => <PasswordRecoveryPage />),
      Match.when("password-recovery-code", () => <RecoveryCodePage />),
      Match.when("new-password", () => <NewPasswordPage />),
      Match.when("password-updated", () => <PasswordUpdatedPage />),
      Match.exhaustive,
    )}</PublicOnlyLayout>),
  )
}
