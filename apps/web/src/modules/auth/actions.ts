import {
  dispatchRecoveryAction,
  recoveryStateAtom,
  requestPasswordResetAction,
  resetPasswordAction,
  startGoogleAuthorizationAction,
  transitionRecovery,
} from "@proxus/frontend-core/auth"
import { DocumentNavigation } from "@proxus/frontend-core/routing"
import { RequestPasswordResetInput, ResetPasswordInput } from "@proxus/shared/auth"
import { Effect, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { Router, routerRuntime } from "../../routes/router.js"

export const startGoogleLoginAction = routerRuntime.fn((_input: void, get) => Effect.gen(function*() {
  const documentNavigation = yield* DocumentNavigation
  const authorization = yield* get.setResult(startGoogleAuthorizationAction, undefined)
  yield* documentNavigation.assign(authorization.authorizationUrl)
}))

export const openPasswordRecoveryAction = routerRuntime.fn((input: { readonly email: string }, get) => Effect.gen(function*() {
  const router = yield* Router
  yield* get.setResult(dispatchRecoveryAction, { _tag: "ForgotRequested", email: input.email })
  yield* router.navigate("password-recovery")
}))

export const submitPasswordRecoveryAction = routerRuntime.fn((input: { readonly email: string }, get) => Effect.gen(function*() {
  const router = yield* Router
  const request = yield* Schema.decodeUnknownEffect(RequestPasswordResetInput)(input)
  yield* get.setResult(requestPasswordResetAction, request)
  yield* get.setResult(dispatchRecoveryAction, { _tag: "CodeRequested" })
  yield* router.navigate("password-recovery-code")
}))

export const submitRecoveryCodeAction = routerRuntime.fn((input: { readonly code: string }, get) => Effect.gen(function*() {
  const router = yield* Router
  yield* get.setResult(dispatchRecoveryAction, { _tag: "CodeAccepted", code: input.code })
  yield* router.navigate("new-password")
}))

export const submitNewPasswordAction = routerRuntime.fn((input: { readonly password: string }, get) => Effect.gen(function*() {
  const router = yield* Router
  const state = get(recoveryStateAtom)
  if (state.screen !== "new-password") return
  const request = yield* Schema.decodeUnknownEffect(ResetPasswordInput)({
    email: state.email,
    code: state.code,
    password: input.password,
  })
  yield* get.setResult(resetPasswordAction, request)
  yield* get.setResult(dispatchRecoveryAction, { _tag: "PasswordReset" })
  yield* router.navigate("password-updated")
}))

export const resendRecoveryCodeAction = Atom.fn<void>()((_input, get) => Effect.gen(function*() {
  const state = get(recoveryStateAtom)
  if (state.email === "") return
  const request = yield* Schema.decodeUnknownEffect(RequestPasswordResetInput)({ email: state.email })
  yield* get.setResult(requestPasswordResetAction, request)
  yield* get.setResult(dispatchRecoveryAction, { _tag: "Resent", cooldownSeconds: 30 })
}))

export const backToLoginAction = routerRuntime.fn((_input: void, get) => Effect.gen(function*() {
  const router = yield* Router
  yield* get.setResult(dispatchRecoveryAction, { _tag: "BackToLogin" })
  yield* router.navigate("login")
}))

export const recoveryCooldownLifecycleAtom = Atom.make((get) => {
  const state = get(recoveryStateAtom)
  return "cooldownSeconds" in state && state.cooldownSeconds > 0
    ? Effect.sleep(`${state.cooldownSeconds} seconds`).pipe(Effect.tap(() => Effect.sync(() => {
        get.set(recoveryStateAtom, transitionRecovery(get(recoveryStateAtom), { _tag: "CooldownElapsed" }))
      })))
    : Effect.void
})
