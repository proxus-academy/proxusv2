import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useFormMessages } from "@proxus/frontend-web/form"
import { Button } from "@proxus/ui"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { AuthError } from "../../modules/auth/auth-controls.js"
import { openPasswordRecoveryAction, startGoogleLoginAction } from "../../modules/auth/actions.js"
import { LoginForm, loginForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"
import { usePublicRouter } from "../../routes/use-public-router.js"

export function LoginPage() {
  const loginResult = useAtomValue(loginForm.submit)
  const startGoogle = useAtomSet(startGoogleLoginAction)
  const startGoogleResult = useAtomValue(startGoogleLoginAction)
  const openRecovery = useAtomSet(openPasswordRecoveryAction)
  const router = usePublicRouter()
  const messages = useFormMessages()
  const copy = messages.auth.login

  return (
    <AuthPage title={copy.title}>
      <AuthError
        visible={AsyncResult.isFailure(loginResult) || startGoogleResult._tag === "Failure"}
        message={copy.failed}
      />
      <LoginForm.Provider defaultValues={{ email: "", password: "" }}>
        <LoginForm.Form className="space-y-4">
          <LoginForm.email label={copy.email} name="email" type="email" autoComplete="email" />
          <LoginForm.password label={copy.password} name="password" type="password" autoComplete="current-password" />
          <LoginForm.Submit asChild>
            <Button className="w-full">{loginResult.waiting ? copy.submitting : copy.submit}</Button>
          </LoginForm.Submit>
        </LoginForm.Form>
      </LoginForm.Provider>
      <Button
        className="w-full"
        variant="secondary"
        disabled={startGoogleResult.waiting}
        onClick={() => startGoogle()}
      >
        Continuar con Google
      </Button>
      <Button className="w-full" variant="ghost" onClick={() => router.navigate("registration")}>
        Crear una cuenta
      </Button>
      <Button variant="ghost" onClick={() => openRecovery({ email: "" })}>
        He olvidado mi contraseña
      </Button>
    </AuthPage>
  )
}
