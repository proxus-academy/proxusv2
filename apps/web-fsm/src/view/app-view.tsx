import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, FieldError, FieldLabel, Heading, Input, Text } from "@proxus/ui"
import { Match } from "effect"
import type { AppModel, RegistrationState, StudiesState } from "../app/model.js"
import type { AppMessage } from "../app/update.js"

export interface AppViewProps {
  readonly model: AppModel
  readonly send: (message: AppMessage) => void
}

const StudiesView = ({ state }: { readonly state: StudiesState }) => Match.value(state).pipe(
  Match.tag("Loading", () => <Text aria-busy="true">Cargando estudios…</Text>),
  Match.tag("Success", ({ studies }) => <ul className="fsm-studies">{studies.map((study) => <li key={study.id}>{study.name}</li>)}</ul>),
  Match.tag("Refreshing", ({ studies }) => <div aria-busy="true"><ul className="fsm-studies">{studies.map((study) => <li key={study.id}>{study.name}</li>)}</ul><Text size="sm" tone="muted">Actualizando…</Text></div>),
  Match.tag("Failure", ({ error, previous }) => <div><Text role="alert" tone="destructive">{error}</Text>{previous === undefined ? null : <ul className="fsm-studies">{previous.map((study) => <li key={study.id}>{study.name}</li>)}</ul>}</div>),
  Match.exhaustive,
)

const RegistrationView = ({ state, send }: { readonly state: RegistrationState; readonly send: AppViewProps["send"] }) => {
  const draft = state.draft
  const editing = state._tag === "Editing"
  const emailError = editing && state.touched.has("email") ? state.errors.email : undefined
  const displayNameError = editing && state.touched.has("displayName") ? state.errors.displayName : undefined
  return <main className="fsm-shell">
    <Card className="fsm-card" padding="lg">
      <CardHeader>
        <Text tone="primary" weight="bold">PROXUS FSM</Text>
        <CardTitle><Heading level={1}>Crea tu espacio de aprendizaje</Heading></CardTitle>
        <CardDescription>Todo el formulario pertenece al modelo de la máquina.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="fsm-form" onSubmit={(event) => {
          event.preventDefault()
          send({ _tag: "RegistrationSubmitted" })
        }}>
          <Field invalid={emailError !== undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" value={draft.email} disabled={state._tag === "Submitting"}
              aria-invalid={emailError !== undefined} onChange={(event) => send({ _tag: "EmailChanged", value: event.currentTarget.value })} />
            <FieldError>{emailError}</FieldError>
          </Field>
          <Field invalid={displayNameError !== undefined}>
            <FieldLabel htmlFor="display-name">Nombre visible</FieldLabel>
            <Input id="display-name" value={draft.displayName} disabled={state._tag === "Submitting"}
              aria-invalid={displayNameError !== undefined} onChange={(event) => send({ _tag: "DisplayNameChanged", value: event.currentTarget.value })} />
            <FieldError>{displayNameError}</FieldError>
          </Field>
          {state._tag === "Failed" ? <Text role="alert" tone="destructive">{state.error}</Text> : null}
          <Button type="submit" size="lg" loading={state._tag === "Submitting"}>
            {state._tag === "Submitting" ? "Creando cuenta…" : "Entrar en Proxus"}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
}

export function AppView({ model, send }: AppViewProps) {
  return Match.value(model).pipe(
    Match.tag("Booting", () => <main className="fsm-shell" aria-busy="true"><Text>Cargando aplicación…</Text></main>),
    Match.tag("Onboarding", ({ registration }) => <RegistrationView state={registration} send={send} />),
    Match.tag("Dashboard", ({ user, studies }) => <main className="fsm-shell"><Card className="fsm-card" padding="lg">
      <CardHeader><Text tone="primary" weight="bold">PROXUS FSM</Text><CardTitle><Heading level={1}>Hola, {user.displayName}</Heading></CardTitle>
        <CardDescription>La máquina ha completado onboarding y ahora está en Dashboard.</CardDescription></CardHeader>
      <CardContent><Text>Sesión local activa para {user.email}.</Text><section className="fsm-dashboard-section"><Heading level={3}>Tus estudios</Heading><StudiesView state={studies} /></section></CardContent>
      <CardFooter className="fsm-actions"><Button variant="soft" onClick={() => send({ _tag: "StudiesInvalidated" })}>Invalidar y recargar</Button><Button variant="secondary" onClick={() => send({ _tag: "LoggedOut" })}>Cerrar sesión</Button></CardFooter>
    </Card></main>),
    Match.tag("NotFound", ({ path }) => <main className="fsm-shell"><Card className="fsm-card" padding="lg">
      <CardHeader><CardTitle><Heading level={1}>Página no encontrada</Heading></CardTitle><CardDescription>{path}</CardDescription></CardHeader>
    </Card></main>),
    Match.exhaustive,
  )
}
