export type RecoveryState =
  | { readonly screen: "login"; readonly email: string }
  | { readonly screen: "pending"; readonly email: string; readonly cooldownSeconds: number }
  | { readonly screen: "forgot"; readonly email: string }
  | { readonly screen: "code"; readonly email: string; readonly code: string; readonly cooldownSeconds: number }
  | { readonly screen: "new-password"; readonly email: string; readonly code: string }
  | { readonly screen: "done"; readonly email: string }

export type RecoveryEvent =
  | { readonly _tag: "PendingAccount"; readonly email: string }
  | { readonly _tag: "ForgotRequested"; readonly email: string }
  | { readonly _tag: "CodeRequested" }
  | { readonly _tag: "CodeAccepted"; readonly code: string }
  | { readonly _tag: "PasswordReset" }
  | { readonly _tag: "Resent"; readonly cooldownSeconds: number }
  | { readonly _tag: "CooldownElapsed" }
  | { readonly _tag: "BackToLogin" }

export const initialRecoveryState: RecoveryState = { screen: "login", email: "" }

export function transitionRecovery(state: RecoveryState, event: RecoveryEvent): RecoveryState {
  switch (event._tag) {
    case "PendingAccount": return { screen: "pending", email: event.email, cooldownSeconds: 30 }
    case "ForgotRequested": return { screen: "forgot", email: event.email }
    case "CodeRequested": return state.screen === "forgot" ? { screen: "code", email: state.email, code: "", cooldownSeconds: 30 } : state
    case "CodeAccepted": return state.screen === "code" ? { screen: "new-password", email: state.email, code: event.code } : state
    case "PasswordReset": return state.screen === "new-password" ? { screen: "done", email: state.email } : state
    case "Resent": return state.screen === "code" || state.screen === "pending" ? { ...state, cooldownSeconds: event.cooldownSeconds } : state
    case "CooldownElapsed": return state.screen === "code" || state.screen === "pending" ? { ...state, cooldownSeconds: 0 } : state
    case "BackToLogin": return { screen: "login", email: state.email }
  }
}
