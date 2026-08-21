import { auth_passwordUpdated_description, auth_passwordUpdated_title } from "../../../paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet } from "@effect/atom-react"
import { Exit } from "effect"
import { Text } from "@proxus/ui"
import { BackToLoginButton } from "../../../modules/auth/auth-controls.js"
import { backToLoginAction } from "../../../modules/auth/actions.js"
import { AuthPage } from "../../../modules/auth/auth-shell.js"

export function PasswordUpdatedPage() {
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  return (
    <AuthPage title={auth_passwordUpdated_title()}>
      <Text>{auth_passwordUpdated_description()}</Text>
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/login" })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/_public/password-recovery/done")({
  component: PasswordUpdatedPage,
})
