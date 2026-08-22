import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { LoginWithPasswordInput } from "@proxus/shared/auth"
import { useNavigate } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type FormEvent, useState } from "react"
import { ugcAuth } from "./state.js"

export function LoginScreen() {
  const login = useAtomSet(ugcAuth.loginAtom, { mode: "promiseExit" })
  const result = useAtomValue(ugcAuth.loginAtom)
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = Schema.decodeUnknownSync(LoginWithPasswordInput)({ email, password })
    Effect.runFork(Effect.promise(() => login(input)).pipe(Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.promise(() => navigate({ to: "/ugc", replace: true })) : Effect.void)))
  }
  return <main className="ugc-shell grid min-h-svh place-items-center p-5">
    <section className="ugc-card w-full max-w-md p-7 sm:p-9">
      <a href="/" className="text-lg font-extrabold tracking-[.12em] text-[#793ef9]">PROXUS <span className="rounded-md bg-[#f0ebff] px-2 py-1 text-xs tracking-normal">UGC</span></a>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Tu espacio de creador</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Accede con tu cuenta habitual de Proxus.</p>
      <form className="mt-7 grid gap-4" onSubmit={submit}>
        <label className="ugc-field"><span>Correo</span><input aria-label="Correo" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required /></label>
        <label className="ugc-field"><span>Contraseña</span><input aria-label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} required /></label>
        {result._tag === "Failure" ? <p role="alert" className="text-sm text-red-600">No hemos podido iniciar sesión. Revisa tus datos.</p> : null}
        <button className="ugc-action mt-1" type="submit" disabled={AsyncResult.isWaiting(result)}>{AsyncResult.isWaiting(result) ? "Entrando…" : "Entrar"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">¿Aún no tienes cuenta? <a className="font-semibold text-[#793ef9]" href="/register">Crear cuenta Proxus</a></p>
    </section>
  </main>
}
