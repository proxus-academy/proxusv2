import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { LoginWithPasswordInput } from "@proxus/shared/auth"
import { Cause, Option, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AdminForbidden, AdminUnauthorized, adminAuthComposition } from "./admin-auth.js"

const goTo = (path: string) => window.history.replaceState(null, "", path)
const failure = (result: { readonly cause: Cause.Cause<unknown> }) => Option.getOrUndefined(Cause.findErrorOption(result.cause))

function LoginScreen() {
  const login = useAtomSet(adminAuthComposition.auth.loginAtom)
  const result = useAtomValue(adminAuthComposition.auth.loginAtom)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    login(Schema.decodeUnknownSync(LoginWithPasswordInput)({ email, password }))
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

function Authorized({ children }: { readonly children: (permissions: ReadonlySet<string>) => ReactNode }) {
  const capabilities = useAtomValue(adminAuthComposition.capabilitiesAtom)
  const clearSession = useAtomSet(adminAuthComposition.auth.clearSessionAtom)
  useEffect(() => {
    if (capabilities._tag === "Failure" && failure(capabilities) instanceof AdminUnauthorized) clearSession()
  }, [capabilities, clearSession])
  if (capabilities._tag !== "Success") {
    const forbidden = capabilities._tag === "Failure" && failure(capabilities) instanceof AdminForbidden
    return <main className="p-8"><h1>{forbidden ? "Acceso prohibido" : "Acceso no disponible"}</h1><p role="alert">No tienes acceso a la administración.</p></main>
  }
  return <>{children(new Set(capabilities.value.permissions))}</>
}

export function AdminGuard({ children }: { readonly children: (permissions: ReadonlySet<string>) => ReactNode }) {
  const session = useAtomValue(adminAuthComposition.auth.sessionAtom)
  const restore = useAtomSet(adminAuthComposition.auth.restoreSessionAtom)
  useEffect(() => { restore() }, [restore])
  useEffect(() => {
    if (session._tag === "Success" && session.value === null) goTo("/admin/login")
    if (session._tag === "Success" && session.value !== null && window.location.pathname === "/admin/login") goTo("/admin")
  }, [session])
  if (session._tag === "Initial" || AsyncResult.isWaiting(session)) return <p role="status">Comprobando sesión…</p>
  if (session._tag === "Failure") return <p role="alert">No se pudo comprobar la sesión.</p>
  if (session.value === null || window.location.pathname === "/admin/login") return <LoginScreen />
  return <Authorized>{children}</Authorized>
}
