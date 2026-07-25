import { currentSessionQuery, makeAuthAtoms, makeRecoveryAtoms, transitionRecovery } from "@proxus/frontend-core/auth"
import { makeRegistrationFlowAtoms } from "@proxus/frontend-core/registration"
import { publicProductRoutes } from "@proxus/frontend-core/public-product"
import { PublicStudyCatalogClient } from "@proxus/frontend-core/study-catalog"
import { assignBrowserLocation } from "@proxus/frontend-web/auth"
import { WebHttpClientLive } from "@proxus/frontend-web/http"
import { makePublicWebProductComposition } from "@proxus/frontend-web/public-product"
import { makeWebRegistrationDraftStorage, makeWebRegistrationWizardNavigation } from "@proxus/frontend-web/registration"
import { makeWebPublicStudyCatalogClientLayer } from "@proxus/frontend-web/study-catalog"
import { RequestPasswordResetInput, ResetPasswordInput } from "@proxus/shared/auth"
import type { StudyNodeId } from "@proxus/shared/study-catalog"
import { Effect, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

const makeWebComposition = Effect.gen(function*() {
  const product = yield* makePublicWebProductComposition({
    routerIdentifier: "@proxus/web/AppRouter",
  })
  const auth = WebHttpClientLive.pipe(Atom.runtime, makeAuthAtoms)
  const registrationWizard = makeWebRegistrationWizardNavigation(product.router, product.navigation)
  const studyCatalogRuntime = makeWebPublicStudyCatalogClientLayer("/api").pipe(Atom.runtime)
  const studyCatalog = {
    rootsAtom: studyCatalogRuntime.atom(PublicStudyCatalogClient.use((client) => client.listRoots())),
    childrenFamily: Atom.family((nodeId: StudyNodeId) =>
      studyCatalogRuntime.atom(PublicStudyCatalogClient.use((client) => client.listChildren({ params: { nodeId } }))),
    ),
  }
  const draftStorage = makeWebRegistrationDraftStorage(sessionStorage)
  const recovery = makeRecoveryAtoms()
  const registrationFlow = makeRegistrationFlowAtoms({
    storage: draftStorage,
    now: () => performance.timeOrigin + performance.now(),
    navigate: (step, state, get) => registrationWizard.push(
      step,
      state._tag === "CollectingOnboarding" || state._tag === "ConfirmingGoogle" ? state.draft.path : [],
      get,
    ),
  })

  const localeParams = (get: Atom.FnContext) => ({ locale: get(product.locale.localeAtom) })
  const replace = (get: Atom.FnContext, id: "registration" | "login" | "password-recovery" | "password-recovery-code" | "new-password" | "password-updated" | "home") => {
    switch (id) {
      case "registration": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("registration", localeParams(get))))
      case "login": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("login", localeParams(get))))
      case "password-recovery": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("password-recovery", localeParams(get))))
      case "password-recovery-code": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("password-recovery-code", localeParams(get))))
      case "new-password": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("new-password", localeParams(get))))
      case "password-updated": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("password-updated", localeParams(get))))
      case "home": return product.navigation.run(get, product.router.replace(publicProductRoutes.destination("home", localeParams(get))))
    }
  }

  type AuthEvent =
    | { readonly _tag: "GoogleRequested" }
    | { readonly _tag: "RegistrationRequested" }
    | { readonly _tag: "RecoveryRequested"; readonly email: string }
    | { readonly _tag: "RecoverySubmitted"; readonly email: string }
    | { readonly _tag: "CodeSubmitted"; readonly code: string }
    | { readonly _tag: "PasswordSubmitted"; readonly password: string }
    | { readonly _tag: "ResendRequested" }
    | { readonly _tag: "BackToLoginRequested" }

  const authEventAtom = Atom.fn<AuthEvent>()((event, get) => Effect.gen(function*() {
    const state = get(recovery.stateAtom)
    switch (event._tag) {
      case "GoogleRequested":
        yield* get.setResult(auth.startGoogleAtom, assignBrowserLocation)
        return
      case "RegistrationRequested":
        yield* replace(get, "registration")
        return
      case "RecoveryRequested":
        get.set(recovery.stateAtom, transitionRecovery(state, { _tag: "ForgotRequested", email: event.email }))
        yield* replace(get, "password-recovery")
        return
      case "RecoverySubmitted":
        yield* get.setResult(auth.requestPasswordResetAtom, Schema.decodeUnknownSync(RequestPasswordResetInput)({ email: event.email }))
        get.set(recovery.stateAtom, transitionRecovery(get(recovery.stateAtom), { _tag: "CodeRequested" }))
        yield* replace(get, "password-recovery-code")
        return
      case "CodeSubmitted":
        get.set(recovery.stateAtom, transitionRecovery(state, { _tag: "CodeAccepted", code: event.code }))
        yield* replace(get, "new-password")
        return
      case "PasswordSubmitted":
        if (state.screen !== "new-password") return
        yield* get.setResult(auth.resetPasswordAtom, Schema.decodeUnknownSync(ResetPasswordInput)({ email: state.email, code: state.code, password: event.password }))
        get.set(recovery.stateAtom, transitionRecovery(state, { _tag: "PasswordReset" }))
        yield* replace(get, "password-updated")
        return
      case "ResendRequested":
        if (state.email === "") return
        yield* get.setResult(auth.requestPasswordResetAtom, Schema.decodeUnknownSync(RequestPasswordResetInput)({ email: state.email }))
        get.set(recovery.stateAtom, transitionRecovery(state, { _tag: "Resent", cooldownSeconds: 30 }))
        return
      case "BackToLoginRequested":
        get.set(recovery.stateAtom, transitionRecovery(state, { _tag: "BackToLogin" }))
        yield* replace(get, "login")
    }
  }))

  const recoveryCooldownLifecycleAtom = Atom.make((get) => {
    const state = get(recovery.stateAtom)
    return "cooldownSeconds" in state && state.cooldownSeconds > 0
      ? Effect.sleep(`${state.cooldownSeconds} seconds`).pipe(Effect.tap(() => Effect.sync(() => {
          get.set(recovery.stateAtom, transitionRecovery(get(recovery.stateAtom), { _tag: "CooldownElapsed" }))
        })))
      : Effect.void
  })
  const authenticatedLayoutLifecycleAtom = Atom.make((get) => {
    const session = get(currentSessionQuery)
    return session._tag === "Success" && session.value === null ? replace(get, "login") : Effect.void
  })
  const publicLayoutLifecycleAtom = Atom.make((get) => {
    const session = get(currentSessionQuery)
    return session._tag === "Success" && session.value !== null ? replace(get, "home") : Effect.void
  })
  const currentPageAtom = Atom.make((get) => get(product.router.current).id)

  return {
    ...product,
    auth: { ...auth, authEventAtom, recoveryCooldownLifecycleAtom },
    recovery,
    authLayouts: { authenticatedLayoutLifecycleAtom, publicLayoutLifecycleAtom },
    studyCatalog,
    registrationWizard,
    registrationFlow,
    draftStorage,
    currentPageAtom,
  }
})

export const composition = await Effect.runPromise(makeWebComposition)
