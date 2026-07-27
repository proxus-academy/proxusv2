import { useAtomSet } from "@effect/atom-react"
import { Text } from "@proxus/ui"
import { BackToLoginButton } from "../../modules/auth/auth-controls.js"
import { backToLoginAction } from "../../modules/auth/actions.js"
import { AuthPage } from "../../patterns/auth-page.js"

export function PasswordUpdatedPage() {
  const back = useAtomSet(backToLoginAction)
  return (
    <AuthPage title="Contraseña actualizada">
      <Text>Ya puedes iniciar sesión con tu contraseña nueva.</Text>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
