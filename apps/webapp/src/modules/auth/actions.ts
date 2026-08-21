import {
  dispatchRecoveryAction,
  recoveryStateAtom,
  requestPasswordResetAction,
  resetPasswordAction,
  startGoogleAuthorizationAction,
  transitionRecovery,
} from "@proxus/frontend-core/auth"
import { DocumentNavigation } from "@proxus/frontend-core/navigation"
import { RequestPasswordResetInput, ResetPasswordInput } from "@proxus/shared/auth"
import { Effect, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { documentNavigationRuntime } from "../../platform/routing/document-navigation-runtime.js"

export const startGoogleLoginAction = documentNavigationRuntime.fn((
  request: { readonly requestId: string },
  get,
) => Effect.gen(function*() {
  const documentNavigation = yield* DocumentNavigation
  const authorization = yield* get.setResult(startGoogleAuthorizationAction, request)
  yield* documentNavigation.assign(authorization.authorizationUrl)
}))

export const openPasswordRecoveryAction = Atom.fn<{ readonly email: string }>()((input, get) =>
  get.setResult(dispatchRecoveryAction, { _tag: "ForgotRequested", email: input.email }))

export const submitPasswordRecoveryAction = Atom.fn<{ readonly email: string }>()((input, get) => Effect.gen(function*() {
  const request = yield* Schema.decodeUnknownEffect(RequestPasswordResetInput)(input)
  yield* get.setResult(requestPasswordResetAction, request)
  yield* get.setResult(dispatchRecoveryAction, { _tag: "CodeRequested" })
}))

export const submitRecoveryCodeAction = Atom.fn<{ readonly code: string }>()((input, get) =>
  get.setResult(dispatchRecoveryAction, { _tag: "CodeAccepted", code: input.code }))

export const submitNewPasswordAction = Atom.fn<{ readonly password: string }>()((input, get) => Effect.gen(function*() {
  const state = get(recoveryStateAtom)
  if (state.screen !== "new-password") return
  const request = yield* Schema.decodeUnknownEffect(ResetPasswordInput)({
    email: state.email,
    code: state.code,
    password: input.password,
  })
  yield* get.setResult(resetPasswordAction, request)
  yield* get.setResult(dispatchRecoveryAction, { _tag: "PasswordReset" })
}))

export const resendRecoveryCodeAction = Atom.fn<void>()((_input, get) => Effect.gen(function*() {
  const state = get(recoveryStateAtom)
  if (state.email === "") return
  const request = yield* Schema.decodeUnknownEffect(RequestPasswordResetInput)({ email: state.email })
  yield* get.setResult(requestPasswordResetAction, request)
  yield* get.setResult(dispatchRecoveryAction, { _tag: "Resent", cooldownSeconds: 30 })
}))

export const backToLoginAction = Atom.fn<void>()((_input, get) =>
  get.setResult(dispatchRecoveryAction, { _tag: "BackToLogin" }))

export const recoveryCooldownLifecycleAtom = Atom.make((get) => {
  const state = get(recoveryStateAtom)
  return "cooldownSeconds" in state && state.cooldownSeconds > 0
    ? Effect.sleep(`${state.cooldownSeconds} seconds`).pipe(Effect.tap(() => Effect.sync(() => {
        get.set(recoveryStateAtom, transitionRecovery(get(recoveryStateAtom), { _tag: "CooldownElapsed" }))
      })))
    : Effect.void
})
