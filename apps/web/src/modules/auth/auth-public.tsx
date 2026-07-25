import { useFormMessages } from "@proxus/frontend-web/form"
import { Button, Heading, Text } from "@proxus/ui"
import type { ReactNode } from "react"
import { ForgotPasswordForm, NewPasswordForm, RecoveryCodeForm } from "./forms.js"

export function AuthShell({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <main className="min-h-screen bg-background px-5 py-10 text-foreground"><section className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center"><Text className="mb-3 font-bold text-primary">PROXUS</Text><Heading level={1}>{title}</Heading><div className="mt-7 space-y-4">{children}</div></section></main>
}

export function AuthError({ visible, message }: { readonly visible: boolean; readonly message?: string }) {
  const messages = useFormMessages()
  return visible ? <Text role="alert" tone="muted">{message ?? messages.errors.unexpected}</Text> : null
}

function Back({ onClick }: { readonly onClick: () => void }) {
  const messages = useFormMessages()
  return <Button variant="ghost" onClick={onClick}>{messages.common.back}</Button>
}

export interface ForgotPasswordViewProps {
  readonly busy?: boolean
  readonly error?: boolean
  readonly email?: string
  readonly onSubmit: (email: string) => void
  readonly onBackToLogin: () => void
}

export function ForgotPasswordView(props: ForgotPasswordViewProps) {
  const messages = useFormMessages()
  const copy = messages.auth.forgotPassword
  return <AuthShell title={copy.title}>
    <Text tone="muted">{copy.description}</Text>
    <ForgotPasswordForm.Provider defaultValues={{ email: props.email ?? "" }}>
      <ForgotPasswordForm.Form className="space-y-4" getSubmitArgs={() => (value) => props.onSubmit(value.email)}>
        <ForgotPasswordForm.email label={messages.auth.login.email} name="email" type="email" autoComplete="email" />
        <AuthError visible={props.error === true} />
        <ForgotPasswordForm.Submit asChild><Button disabled={props.busy === true}>{copy.submit}</Button></ForgotPasswordForm.Submit>
      </ForgotPasswordForm.Form>
    </ForgotPasswordForm.Provider>
    <Back onClick={props.onBackToLogin} />
  </AuthShell>
}

export interface CodeViewProps {
  readonly pending?: boolean
  readonly busy?: boolean
  readonly error?: boolean
  readonly email?: string
  readonly cooldownSeconds?: number
  readonly onCode: (code: string) => void
  readonly onResend: () => void
  readonly onBackToLogin: () => void
}

export function CodeView(props: CodeViewProps) {
  const messages = useFormMessages()
  const copy = messages.auth.recoveryCode
  return <AuthShell title={props.pending === true ? copy.pendingTitle : copy.title}>
    {props.pending === true ? <Text tone="muted">{props.email}</Text> : null}
    <RecoveryCodeForm.Provider defaultValues={{ code: "" }}>
      <RecoveryCodeForm.Form className="space-y-4" getSubmitArgs={() => (value) => props.onCode(value.code)}>
        <RecoveryCodeForm.code label={copy.code} name="code" inputMode="numeric" autoComplete="one-time-code" />
        <AuthError visible={props.error === true} />
        <RecoveryCodeForm.Submit asChild><Button disabled={props.busy === true}>{props.pending === true ? copy.verify : copy.continue}</Button></RecoveryCodeForm.Submit>
      </RecoveryCodeForm.Form>
    </RecoveryCodeForm.Provider>
    <Button variant="secondary" disabled={props.busy === true || (props.cooldownSeconds ?? 0) > 0} onClick={props.onResend}>{(props.cooldownSeconds ?? 0) > 0 ? `Reenviar en ${props.cooldownSeconds}s` : copy.resend}</Button>
    <Back onClick={props.onBackToLogin} />
  </AuthShell>
}

export interface NewPasswordViewProps {
  readonly busy?: boolean
  readonly error?: boolean
  readonly onSubmit: (password: string) => void
  readonly onBackToLogin: () => void
}

export function NewPasswordView(props: NewPasswordViewProps) {
  const messages = useFormMessages()
  const copy = messages.auth.newPassword
  return <AuthShell title={copy.title}>
    <Text tone="muted">{copy.description}</Text>
    <span className="sr-only">{copy.confirmation}</span>
    <NewPasswordForm.Provider defaultValues={{ password: "", confirmation: "" }}>
      <NewPasswordForm.Form className="space-y-4" getSubmitArgs={() => (value) => props.onSubmit(value.password)}>
        <NewPasswordForm.password label={copy.password} name="password" type="password" autoComplete="new-password" />
        <NewPasswordForm.confirmation label={copy.confirmation} name="confirmation" type="password" autoComplete="new-password" />
        <AuthError visible={props.error === true} />
        <NewPasswordForm.Submit asChild><Button disabled={props.busy === true}>{copy.submit}</Button></NewPasswordForm.Submit>
      </NewPasswordForm.Form>
    </NewPasswordForm.Provider>
    <Back onClick={props.onBackToLogin} />
  </AuthShell>
}

export function PasswordUpdatedView({ onBackToLogin }: { readonly onBackToLogin: () => void }) {
  return <AuthShell title="Contraseña actualizada"><Text>Ya puedes iniciar sesión con tu contraseña nueva.</Text><Back onClick={onBackToLogin} /></AuthShell>
}

export function LogoutButton({ busy, error, onLogout }: { readonly busy?: boolean; readonly error?: boolean; readonly onLogout: () => void }) {
  return <div><Button variant="ghost" disabled={busy === true} onClick={onLogout}>{busy === true ? "Cerrando sesión…" : "Cerrar sesión"}</Button><AuthError visible={error === true} /></div>
}
