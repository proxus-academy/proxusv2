import { auth_login_createAccount, auth_login_email, auth_login_failed, auth_login_forgotPassword, auth_login_google, auth_login_password, auth_login_submit, auth_login_submitting, auth_login_title } from "../../paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button, Form } from "@proxus/ui"
import { Exit } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { AuthError } from "../../modules/auth/auth-controls.js"
import { openPasswordRecoveryAction, startGoogleLoginAction } from "../../modules/auth/actions.js"
import { LoginForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../modules/auth/auth-shell.js"

export function LoginPage() {
  const loginResult = useAtomValue(LoginForm.submit)
  const submitLogin = useAtomSet(LoginForm.submit)
  const startGoogle = useAtomSet(startGoogleLoginAction)
  const startGoogleResult = useAtomValue(startGoogleLoginAction)
  const openRecovery = useAtomSet(openPasswordRecoveryAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()

  return (
    <AuthPage title={auth_login_title()}>
      <AuthError
        visible={AsyncResult.isFailure(loginResult) || startGoogleResult._tag === "Failure"}
        message={auth_login_failed()}
      />
      <LoginForm.Initialize defaultValues={{ email: "", password: "" }}>
        <Form gap="lg" onSubmit={(event) => {
          event.preventDefault()
          submitLogin()
        }}>
          <LoginForm.email label={auth_login_email()} name="email" type="email" autoComplete="email" />
          <LoginForm.password label={auth_login_password()} name="password" type="password" autoComplete="current-password" />
          <Button width="full" type="submit">{loginResult.waiting ? auth_login_submitting() : auth_login_submit()}</Button>
        </Form>
      </LoginForm.Initialize>
      <Button
        width="full"
        variant="secondary"
        disabled={startGoogleResult.waiting}
        onClick={() => startGoogle({
          requestId: `${globalThis.performance.timeOrigin}:${globalThis.performance.now()}`,
        })}
      >
        {auth_login_google()}
      </Button>
      <Button width="full" variant="ghost" onClick={() => {
        void navigate({ to: "/", search: {} })
      }}> 
        {auth_login_createAccount()}
      </Button>
      <Button variant="ghost" onClick={() => {
        void openRecovery({ email: "" }).then((exit) => {
          if (Exit.isSuccess(exit)) {
            void navigate({ to: "/password-recovery" })
          }
        })
      }}>
        {auth_login_forgotPassword()}
      </Button>
    </AuthPage>
  )
}

export const Route = createFileRoute("/_public/login")({
  component: LoginPage,
})
