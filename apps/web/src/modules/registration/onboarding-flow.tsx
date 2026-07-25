import {
  firstIncompleteStep,
  transitionRegistration,
  type RegistrationDraft,
  type RegistrationEvent,
  type RegistrationState,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import type { ProblemKind } from "@proxus/shared/auth"
import type { StudyNode } from "@proxus/shared/study-catalog"
import type { StudyCatalogViewState } from "@proxus/frontend-core/study-catalog"
import { Button, ChoiceCard, Heading, Input, Text, Textarea } from "@proxus/ui"
import { Match } from "effect"
import type { FormEvent } from "react"
import { RegistrationAccountForm, RegistrationProfileForm } from "./forms.js"

export interface RegistrationScreenActions {
  readonly dispatch: (event: RegistrationEvent) => void
  readonly navigate: (step: RegistrationStep) => void
  readonly startGoogle: () => void
  readonly submitEmail: (input: { readonly email: string; readonly password: string }) => void
  readonly verifyCode: (code: string) => void
  readonly resendCode: () => void
  readonly confirmGoogle: () => void
  readonly login: () => void
}

export interface RegistrationOnboardingViewProps {
  readonly state: RegistrationState
  readonly requestedStep?: RegistrationStep
  readonly studyOptions?: StudyCatalogViewState<ReadonlyArray<StudyNode>>
  readonly googleEmail?: string
  readonly busy?: boolean
  readonly actions: RegistrationScreenActions
}

const problemLabels: ReadonlyArray<readonly [ProblemKind, string]> = [
  ["understand-content", "Entender mejor el contenido"],
  ["prepare-exams", "Preparar exámenes"],
  ["organize-study", "Organizar mi estudio"],
  ["choose-studies", "Elegir qué estudiar"],
  ["other", "Otro"],
]
type StudyStep = "country" | "study-type" | "institution" | "degree" | "subject"
const isStudyStep = (step: RegistrationStep): step is StudyStep =>
  step === "country" || step === "study-type" || step === "institution" || step === "degree" || step === "subject"
const labels: Record<StudyNode["kind"], string> = { country: "País", type: "Tipo de estudio", university: "Institución", degree: "Grado", subject: "Asignatura" }
const studyStepTitles: Record<StudyStep, string> = {
  country: "Elige país",
  "study-type": "Elige tipo de estudio",
  institution: "Elige institución",
  degree: "Elige grado",
  subject: "Elige asignatura",
} 

const submit = (handler: (data: FormData) => void) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  handler(new FormData(event.currentTarget))
}

function DraftSummary({ draft, navigate }: { readonly draft: RegistrationDraft; readonly navigate: (step: RegistrationStep) => void }) {
  const problem = problemLabels.find(([kind]) => kind === draft.problemKind)?.[1]
  return <aside aria-label="Resumen del registro" className="rounded-xl border bg-card p-4">
    <Heading level={2}>Tu resumen</Heading>
    <dl>
      <dt>Problema</dt><dd>{draft.problemOtherText ?? problem ?? "Pendiente"} <Button type="button" variant="ghost" onClick={() => navigate("problem")}>Editar problema</Button></dd>
      <dt>Estudios</dt><dd>{draft.path.map((node) => node.name).join(" → ") || "Pendiente"} <Button type="button" variant="ghost" onClick={() => navigate("country")}>Editar estudios</Button></dd>
      <dt>Perfil</dt><dd>{draft.username === undefined ? "Pendiente" : `${draft.username}, ${String(draft.birthYear)}`} <Button type="button" variant="ghost" onClick={() => navigate("profile")}>Editar perfil</Button></dd>
    </dl>
  </aside>
}

export function RegistrationOnboardingView({ state, requestedStep, studyOptions = { _tag: "Initial" }, googleEmail, busy = false, actions }: RegistrationOnboardingViewProps) {
  // Keep this projection exhaustive: adding a registration state must force an
  // explicit rendering decision instead of falling through to draft access.
  const screen = Match.value(state).pipe(Match.tagsExhaustive({
    ChoosingMethod: () => "choosing" as const,
    ResolvingGoogle: () => "resolving-google" as const,
    CollectingOnboarding: () => "onboarding" as const,
    EmailVerificationPending: () => "verification" as const,
    ConfirmingGoogle: () => "confirm-google" as const,
    Completed: () => "completed" as const,
  }))
  if (screen === "completed") return <main><Heading level={1}>¡Todo listo!</Heading><Text>Tu cuenta está activa.</Text></main>
  if (screen === "resolving-google") return <main aria-busy="true"><Heading level={1}>Conectando con Google…</Heading></main>
  if (screen === "choosing") return <main><Heading level={1}>Empieza a estudiar a tu manera</Heading><Text>Cuéntanos qué necesitas y qué estudias.</Text><Button disabled={busy} onClick={actions.startGoogle}>Continuar con Google</Button><Button disabled={busy} onClick={() => actions.dispatch({ _tag: "EmailStarted" })}>Empezar con email</Button><Button variant="ghost" onClick={actions.login}>Ya tengo cuenta</Button></main>
  if (screen === "verification" && state._tag === "EmailVerificationPending") return <main><Heading level={1}>Verifica tu cuenta</Heading><Text>Hemos enviado un código a {state.maskedEmail}.</Text><form onSubmit={submit((data) => actions.verifyCode(String(data.get("code"))))}><label>Código de seis dígitos<Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" /></label><Button disabled={busy} type="submit">Confirmar código</Button></form><Button variant="ghost" onClick={actions.resendCode}>Reenviar código</Button></main>

  if (state._tag !== "CollectingOnboarding" && state._tag !== "ConfirmingGoogle") return null
  const draft = state.draft
  const step = state._tag === "ConfirmingGoogle" ? "confirm-google" : (requestedStep ?? state.step)
  if (step === "problem") return <main><Heading level={1}>¿Qué quieres resolver?</Heading><form onSubmit={submit((data) => {
    const submittedKind = String(data.get("problemKind"))
    const kind = problemLabels.find(([candidate]) => candidate === submittedKind)?.[0]
    if (kind === undefined) return
    const otherText = kind === "other" ? String(data.get("otherText") ?? "") : undefined
    actions.dispatch({ _tag: "ProblemSelected", kind, ...(otherText === undefined ? {} : { otherText }) })
  })}>{problemLabels.map(([kind, label]) => <label key={kind}><input type="radio" name="problemKind" value={kind} required defaultChecked={draft.problemKind === kind} />{label}</label>)}<label>Cuéntanos más<Textarea name="otherText" maxLength={280} defaultValue={draft.problemOtherText ?? ""} /></label><Button type="submit">Continuar</Button></form></main>
  if (isStudyStep(step)) return <main><Heading level={1}>{studyStepTitles[step]}</Heading><Text>{draft.path.map((node) => node.name).join(" → ")}</Text>{studyOptions._tag === "Initial" ? <Text aria-live="polite">Cargando opciones…</Text> : studyOptions._tag === "Failure" ? <Text role="alert">No hemos podido cargar las opciones. Inténtalo de nuevo.</Text> : studyOptions.value.length === 0 ? <Text>No hay opciones publicadas.</Text> : <div>{studyOptions.value.map((node) => <ChoiceCard key={node.id} title={node.name} leading={labels[node.kind]} onClick={() => actions.dispatch({ _tag: "StudyNodeSelected", node })} />)}</div>}<Button variant="ghost" onClick={() => actions.navigate(step === "country" ? "problem" : "country")}>Volver</Button></main>
  if (step === "profile") return <main><Heading level={1}>Crea tu perfil</Heading><RegistrationProfileForm.Provider defaultValues={{ username: draft.username ?? "", birthYear: draft.birthYear ?? 2000 }}><RegistrationProfileForm.KeepAlive /><RegistrationProfileForm.Form getSubmitArgs={() => (value) => actions.dispatch({ _tag: "ProfileCompleted", ...value })}><RegistrationProfileForm.username label="Nombre de usuario" /><RegistrationProfileForm.birthYear label="Año de nacimiento" /><RegistrationProfileForm.Submit asChild><Button>Continuar</Button></RegistrationProfileForm.Submit></RegistrationProfileForm.Form></RegistrationProfileForm.Provider><DraftSummary draft={draft} navigate={actions.navigate} /></main>
  if (step === "account") return <main><Heading level={1}>Crea tu cuenta</Heading><DraftSummary draft={draft} navigate={actions.navigate} /><RegistrationAccountForm.Provider defaultValues={{ email: "", password: "", terms: false }}><RegistrationAccountForm.KeepAlive /><RegistrationAccountForm.Form getSubmitArgs={() => ({ email, password }) => actions.submitEmail({ email, password })}><RegistrationAccountForm.email label="Email" type="email" /><RegistrationAccountForm.password label="Contraseña" type="password" /><RegistrationAccountForm.terms label="Acepto los términos y la privacidad" /><RegistrationAccountForm.Submit asChild><Button disabled={busy}>Crear cuenta</Button></RegistrationAccountForm.Submit></RegistrationAccountForm.Form></RegistrationAccountForm.Provider></main>
  return <main><Heading level={1}>Confirma tus datos de Google</Heading><Text>Email verificado: {googleEmail ?? "Cuenta de Google"}</Text><DraftSummary draft={draft} navigate={actions.navigate} /><label><input type="checkbox" required form="google-confirm" /> Acepto los términos y la privacidad</label><form id="google-confirm" onSubmit={(event) => { event.preventDefault(); actions.confirmGoogle() }}><Button disabled={busy} type="submit">Confirmar alta</Button></form></main>
}

/** Pure helper for app-specific atom/composition roots: existing Google sessions never create an onboarding draft. */
export const resolveGoogleState = (state: RegistrationState, event: Extract<RegistrationEvent, { readonly _tag: "GoogleResolved" }>) => transitionRegistration(state, event)
export const restoredRegistrationState = (draft: RegistrationDraft): RegistrationState => ({ _tag: "CollectingOnboarding", draft, step: firstIncompleteStep(draft) })
