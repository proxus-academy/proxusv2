import { useFormMessages } from "@proxus/frontend-web/form"
import { Button, Text } from "@proxus/ui"

export function AuthError({ visible, message }: {
  readonly visible: boolean
  readonly message?: string
}) {
  const messages = useFormMessages()
  return visible
    ? <Text role="alert" tone="muted">{message ?? messages.errors.unexpected}</Text>
    : null
}

export function BackToLoginButton({ onClick }: { readonly onClick: () => void }) {
  const messages = useFormMessages()
  return <Button variant="ghost" onClick={onClick}>{messages.common.back}</Button>
}

export function LogoutButton({ busy, error, onLogout }: {
  readonly busy?: boolean
  readonly error?: boolean
  readonly onLogout: () => void
}) {
  return (
    <div>
      <Button variant="ghost" disabled={busy === true} onClick={onLogout}>
        {busy === true ? "Cerrando sesión…" : "Cerrar sesión"}
      </Button>
      <AuthError visible={error === true} />
    </div>
  )
}
