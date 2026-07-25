import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useFormMessages } from "@proxus/frontend-web/form"
import { Button } from "@proxus/ui"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { composition } from "../../composition.js"
import { AuthError, AuthShell } from "./auth-public.js"
import { LoginForm, loginForm } from "./forms.js"

export function LoginPage() {
  const result = useAtomValue(loginForm.submit)
  const dispatch = useAtomSet(composition.auth.authEventAtom)
  const messages = useFormMessages()
  const copy = messages.auth.login

  return <AuthShell title={copy.title}>
    <AuthError visible={AsyncResult.isFailure(result)} message={copy.failed} />
    <LoginForm.Provider defaultValues={{ email: "", password: "" }}>
      <LoginForm.Form className="space-y-4">
        <LoginForm.email label={copy.email} name="email" type="email" autoComplete="email" />
        <LoginForm.password label={copy.password} name="password" type="password" autoComplete="current-password" />
        <LoginForm.Submit asChild>
          <Button className="w-full">{result.waiting ? copy.submitting : copy.submit}</Button>
        </LoginForm.Submit>
      </LoginForm.Form>
    </LoginForm.Provider>
    <Button className="w-full" variant="secondary" onClick={() => dispatch({ _tag: "GoogleRequested" })}>Continuar con Google</Button>
    <Button className="w-full" variant="ghost" onClick={() => dispatch({ _tag: "RegistrationRequested" })}>Crear una cuenta</Button>
    <Button variant="ghost" onClick={() => dispatch({ _tag: "RecoveryRequested", email: "" })}>He olvidado mi contraseña</Button>
  </AuthShell>
}
