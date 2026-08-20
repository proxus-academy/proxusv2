import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { LoginWithPasswordInput } from "@proxus/shared/auth"
import { useNavigate } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type FormEvent, useState } from "react"
import { Button } from "../../components/ui/button.js"
import { Input } from "../../components/ui/input.js"
import { adminAuthComposition } from "./admin-auth.js"

export function LoginScreen() {
  const login = useAtomSet(adminAuthComposition.auth.loginAtom, { mode: "promiseExit" })
  const result = useAtomValue(adminAuthComposition.auth.loginAtom)
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = Schema.decodeUnknownSync(LoginWithPasswordInput)({ email, password })
    Effect.runFork(Effect.gen(function*() {
      const exit = yield* Effect.promise(() => login(input))
      if (Exit.isSuccess(exit)) {
        yield* Effect.promise(() => navigate({ to: "/admin/nodes", replace: true }))
      }
    }))
  }
  return <main className="mx-auto grid min-h-screen max-w-sm place-content-center gap-5 p-6">
    <div><h1 className="text-2xl font-semibold">Acceso administrativo</h1><p className="text-sm text-muted-foreground">Usa tu cuenta común. Se requieren permisos de administración.</p></div>
    <form className="space-y-3" onSubmit={submit}>
      <Input aria-label="Correo" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <Input aria-label="Contraseña" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {result._tag === "Failure" ? <p role="alert">No se pudo iniciar sesión.</p> : null}
      <Button className="w-full" type="submit" disabled={AsyncResult.isWaiting(result)}>Entrar</Button>
    </form>
  </main>
}
