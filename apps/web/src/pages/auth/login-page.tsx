import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useFormMessages } from "../../platform/form/index.js"
import { Button } from "@proxus/ui"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { AuthError } from "../../modules/auth/auth-controls.js"
import { openPasswordRecoveryAction, startGoogleLoginAction } from "../../modules/auth/actions.js"
import { LoginForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"
import { useRouter } from "../../routes/use-router.js"

export function LoginPage() {
  const loginResult = useAtomValue(LoginForm.submit)
  const submitLogin = useAtomSet(LoginForm.submit)
  const startGoogle = useAtomSet(startGoogleLoginAction)
  const startGoogleResult = useAtomValue(startGoogleLoginAction)
  const openRecovery = useAtomSet(openPasswordRecoveryAction)
  const router = useRouter()
  const messages = useFormMessages()
  const copy = messages.auth.login

  return (
    <AuthPage title={copy.title}>
      <AuthError
        visible={AsyncResult.isFailure(loginResult) || startGoogleResult._tag === "Failure"}
        message={copy.failed}
      />
      <LoginForm.Initialize defaultValues={{ email: "", password: "" }}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          submitLogin()
        }}>
          <LoginForm.email label={copy.email} name="email" type="email" autoComplete="email" />
          <LoginForm.password label={copy.password} name="password" type="password" autoComplete="current-password" />
          <Button className="w-full" type="submit">{loginResult.waiting ? copy.submitting : copy.submit}</Button>
        </form>
      </LoginForm.Initialize>
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
