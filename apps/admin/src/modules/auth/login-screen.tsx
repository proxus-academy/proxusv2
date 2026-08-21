import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { LoginWithPasswordInput } from "@proxus/shared/auth"
import { useNavigate } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type FormEvent, useState } from "react"
import { Button, Center, Form, Heading, Input, Stack, Text } from "@proxus/ui"
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
  return <Center as="main" minHeight="screen" maxWidth="sm" padding="xl">
    <Stack gap="xl">
    <Stack gap="sm"><Heading level={1}>Acceso administrativo</Heading><Text size="sm" tone="muted">Usa tu cuenta común. Se requieren permisos de administración.</Text></Stack>
    <Form gap="md" onSubmit={submit}>
      <Input aria-label="Correo" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <Input aria-label="Contraseña" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {result._tag === "Failure" ? <Text role="alert">No se pudo iniciar sesión.</Text> : null}
      <Button width="full" type="submit" disabled={AsyncResult.isWaiting(result)}>Entrar</Button>
    </Form>
    </Stack>
  </Center>
}
