import type { CompleteGoogleRegistrationInput, GoogleCallbackInput, LoginWithPasswordInput, RegisterWithEmailInput, RequestPasswordResetInput, ResendVerificationInput, ResetPasswordInput, VerifyEmailInput } from "@proxus/shared/auth"
import { Cause, Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PublicApiClient } from "../public-api/client.js"

/**
 * Session state is owned by one atom. A 401 restores the anonymous state while
 * transport failures remain observable. Mutations update this same state.
 */
export const makeAuthAtoms = <R, ER = never>(runtime: Atom.AtomRuntime<PublicApiClient | R, ER>) => {
  const sessionAtom = Atom.make<AsyncResult.AsyncResult<import("@proxus/shared/auth").CurrentSession | null, unknown>>(
    AsyncResult.initial(true),
  ).pipe(Atom.keepAlive)

  const restoreSessionAtom = runtime.fn((_input: void, get) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.authSession.currentSession({})),
      Effect.matchEffect({
        onFailure: (error) => Effect.sync(() => {
          get.set(sessionAtom, typeof error === "object" && error !== null && "_tag" in error && error._tag === "Unauthorized"
            ? AsyncResult.success(null)
            : AsyncResult.failure(Cause.fail(error)))
        }),
        onSuccess: (session) => Effect.sync(() => {
          get.set(sessionAtom, AsyncResult.success(session))
        }),
      }),
    ),
  )

  const loginAtom = runtime.fn((input: LoginWithPasswordInput, get) =>
    PublicApiClient.pipe(
      Effect.flatMap((client) => client.auth.loginWithPassword({ payload: input })),
      Effect.tap((session) => Effect.sync(() => {
        get.set(sessionAtom, AsyncResult.success(session))
      })),
    ),
  )

  const registerWithEmailAtom = runtime.fn((request: { readonly input: RegisterWithEmailInput; readonly onSuccess: () => void }) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.registerWithEmail({ payload: request.input })), Effect.tap(() => Effect.sync(request.onSuccess))),
  )
  const verifyEmailAtom = runtime.fn((request: { readonly input: VerifyEmailInput; readonly onSuccess: (session: import("@proxus/shared/auth").CurrentSession) => void }, get) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.verifyEmail({ payload: request.input })),
      Effect.tap((session) => Effect.sync(() => { get.set(sessionAtom, AsyncResult.success(session)); request.onSuccess(session) })),
    ),
  )
  const resendVerificationAtom = runtime.fn((input: ResendVerificationInput) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.resendVerification({ payload: input }))),
  )
  const startGoogleAtom = runtime.fn((onSuccess: (authorizationUrl: string) => void) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.startGoogle({})),
      Effect.tap(({ authorizationUrl }) => Effect.sync(() => onSuccess(authorizationUrl))),
    ),
  )
  const completeGoogleCallbackAtom = runtime.fn((request: { readonly input: GoogleCallbackInput; readonly onSuccess: (result: import("@proxus/shared/auth").GoogleCallbackResult) => void }, get) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.completeGoogleCallback({ query: request.input })),
      Effect.tap((result) => Effect.sync(() => {
        if (result._tag === "ExistingGoogleSession") get.set(sessionAtom, AsyncResult.success(result.session))
        request.onSuccess(result)
      })),
    ),
  )
  const completeGoogleRegistrationAtom = runtime.fn((request: { readonly input: CompleteGoogleRegistrationInput; readonly onSuccess: (session: import("@proxus/shared/auth").CurrentSession) => void }, get) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.completeGoogleRegistration({ payload: request.input })),
      Effect.tap((session) => Effect.sync(() => { get.set(sessionAtom, AsyncResult.success(session)); request.onSuccess(session) })),
    ),
  )

  const clearSessionAtom = Atom.fn<void>()((_input, get) => Effect.sync(() => {
    get.set(sessionAtom, AsyncResult.success(null))
  }))

  const requestPasswordResetAtom = runtime.fn((input: RequestPasswordResetInput) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.requestPasswordReset({ payload: input }))),
  )
  const resetPasswordAtom = runtime.fn((input: ResetPasswordInput) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.resetPassword({ payload: input }))),
  )
  const requestPasswordResetFlowAtom = runtime.fn((request: { readonly input: RequestPasswordResetInput; readonly onSuccess: () => void }) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.requestPasswordReset({ payload: request.input })), Effect.tap(() => Effect.sync(request.onSuccess))),
  )
  const resetPasswordFlowAtom = runtime.fn((request: { readonly input: ResetPasswordInput; readonly onSuccess: () => void }) =>
    PublicApiClient.pipe(Effect.flatMap((client) => client.auth.resetPassword({ payload: request.input })), Effect.tap(() => Effect.sync(request.onSuccess))),
  )

  return {
    sessionAtom,
    restoreSessionAtom,
    loginAtom,
    registerWithEmailAtom,
    verifyEmailAtom,
    resendVerificationAtom,
    startGoogleAtom,
    completeGoogleCallbackAtom,
    completeGoogleRegistrationAtom,
    clearSessionAtom,
    requestPasswordResetAtom,
    resetPasswordAtom,
    requestPasswordResetFlowAtom,
    resetPasswordFlowAtom,
  }
}

export type AuthAtoms = ReturnType<typeof makeAuthAtoms>
