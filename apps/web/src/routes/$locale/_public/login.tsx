import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button } from "@proxus/ui"
import { Exit } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { AuthError } from "../../../modules/auth/auth-controls.js"
import { openPasswordRecoveryAction, startGoogleLoginAction } from "../../../modules/auth/actions.js"
import { LoginForm } from "../../../modules/auth/forms.js"
import { AuthPage } from "../../../modules/auth/auth-shell.js"
import { useTranslation } from "../../../platform/product-locale/paraglide-react.js"

export function LoginPage() {
  const loginResult = useAtomValue(LoginForm.submit)
  const submitLogin = useAtomSet(LoginForm.submit)
  const startGoogle = useAtomSet(startGoogleLoginAction)
  const startGoogleResult = useAtomValue(startGoogleLoginAction)
  const openRecovery = useAtomSet(openPasswordRecoveryAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  const { locale } = Route.useParams()
  const { t } = useTranslation("auth", { keyPrefix: "login" })

  return (
    <AuthPage title={t("title")}>
      <AuthError
        visible={AsyncResult.isFailure(loginResult) || startGoogleResult._tag === "Failure"}
        message={t("failed")}
      />
      <LoginForm.Initialize defaultValues={{ email: "", password: "" }}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          submitLogin()
        }}>
          <LoginForm.email label={t("email")} name="email" type="email" autoComplete="email" />
          <LoginForm.password label={t("password")} name="password" type="password" autoComplete="current-password" />
          <Button className="w-full" type="submit">{loginResult.waiting ? t("submitting") : t("submit")}</Button>
        </form>
      </LoginForm.Initialize>
      <Button
        className="w-full"
        variant="secondary"
        disabled={startGoogleResult.waiting}
        onClick={() => startGoogle({
          requestId: `${globalThis.performance.timeOrigin}:${globalThis.performance.now()}`,
        })}
      >
        {t("google")}
      </Button>
      <Button className="w-full" variant="ghost" onClick={() => {
        void navigate({ to: "/$locale", params: { locale }, search: {} })
      }}> 
        {t("createAccount")}
      </Button>
      <Button variant="ghost" onClick={() => {
        void openRecovery({ email: "" }).then((exit) => {
          if (Exit.isSuccess(exit)) {
            void navigate({ to: "/$locale/password-recovery", params: { locale } })
          }
        })
      }}>
        {t("forgotPassword")}
      </Button>
    </AuthPage>
  )
}

export const Route = createFileRoute("/$locale/_public/login")({
  component: LoginPage,
})
