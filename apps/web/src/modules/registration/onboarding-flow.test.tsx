// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { RegistrationDraft, RegistrationState } from "@proxus/frontend-core/registration"
import { CurrentSession, makeAccountId, makeSessionId } from "@proxus/shared/auth"
import { Schema } from "effect"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { RegistrationOnboardingView, resolveGoogleState, restoredRegistrationState, type RegistrationScreenActions } from "./onboarding-flow.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const emailDraft: RegistrationDraft = { provider: "email", path: [] }
const actions = (): RegistrationScreenActions => ({ dispatch: vi.fn(), navigate: vi.fn(), startGoogle: vi.fn(), submitEmail: vi.fn(), verifyCode: vi.fn(), resendCode: vi.fn(), confirmGoogle: vi.fn(), login: vi.fn() })
let host: HTMLDivElement
let root: Root
const render = (state: RegistrationState, screenActions = actions(), requestedStep?: RegistrationOnboardingViewParameters["requestedStep"]) => {
  act(() => root.render(<RegistrationOnboardingView state={state} {...(requestedStep === undefined ? {} : { requestedStep })} googleEmail="verified@example.test" actions={screenActions} />))
  return screenActions
}
type RegistrationOnboardingViewParameters = Parameters<typeof RegistrationOnboardingView>[0]
const click = (text: string) => {
  const element = [...host.querySelectorAll("button")].find((item) => item.textContent === text)
  if (element === undefined) throw new Error(`Missing button: ${text}`)
  act(() => element.click())
}

beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); sessionStorage.clear() })

describe("public registration onboarding screens", () => {
  it("offers Google, email and common login actions on start", () => {
    const screenActions = render({ _tag: "ChoosingMethod" })
    click("Continuar con Google"); click("Empezar con email"); click("Ya tengo cuenta")
    expect(screenActions.startGoogle).toHaveBeenCalledOnce()
    expect(screenActions.dispatch).toHaveBeenCalledWith({ _tag: "EmailStarted" })
    expect(screenActions.login).toHaveBeenCalledOnce()
  })

  it("submits the bounded other problem and exposes every study/profile screen", () => {
    const screenActions = render({ _tag: "CollectingOnboarding", draft: emailDraft, step: "problem" })
    const other = host.querySelector<HTMLInputElement>('input[value="other"]')
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")
    if (other === null || textarea === null) throw new Error("Expected problem form controls")
    act(() => { other.click(); textarea.value = "Necesito adaptar mi rutina" })
    click("Continuar")
    expect(screenActions.dispatch).toHaveBeenCalledWith({ _tag: "ProblemSelected", kind: "other", otherText: "Necesito adaptar mi rutina" })

    for (const step of ["country", "study-type", "institution", "degree", "subject", "profile"] as const) {
      render({ _tag: "CollectingOnboarding", draft: emailDraft, step }, screenActions, step)
      expect(host.querySelector("h1")?.textContent).toBeTruthy()
    }
  })

  it("shows an editable summary and keeps a restored draft after refresh", () => {
    const restored = restoredRegistrationState({ provider: "email", problemKind: "prepare-exams", path: [], username: "alumna_1", birthYear: 2001 })
    const screenActions = render(restored, actions(), "account")
    expect(host.textContent).toContain("Preparar exámenes")
    expect(host.textContent).toContain("alumna_1, 2001")
    click("Editar problema")
    expect(screenActions.navigate).toHaveBeenCalledWith("problem")
  })

  it("renders account, verification and Google confirmation actions", () => {
    const completeDraft = { ...emailDraft, problemKind: "organize-study" as const, username: "student_1", birthYear: 2000 }
    const screenActions = render({ _tag: "CollectingOnboarding", draft: completeDraft, step: "account" }, actions(), "account")
    expect(host.querySelector('input[type="password"]')).not.toBeNull()
    render({ _tag: "EmailVerificationPending", draftId: "opaque", maskedEmail: "a***@example.test" }, screenActions)
    expect(host.textContent).toContain("a***@example.test")
    click("Reenviar código")
    expect(screenActions.resendCode).toHaveBeenCalledOnce()
    render({ _tag: "ConfirmingGoogle", draft: { ...completeDraft, provider: "google" } }, screenActions)
    expect(host.textContent).toContain("verified@example.test")
    expect(host.textContent).not.toContain("Contraseña")
  })

  it("Google existing jumps directly to completed without draft or browser secrets", () => {
    history.replaceState(null, "", "/es?step=start&campaign=spring")
    sessionStorage.setItem("unrelated", "kept")
    const session = Schema.decodeUnknownSync(CurrentSession)({
      sessionId: makeSessionId("00000000-0000-4000-8000-000000000001"),
      account: { id: makeAccountId("00000000-0000-4000-8000-000000000002"), email: "safe@example.test", username: "safe_user", status: "active", provider: "email" },
      expiresAt: "1970-01-01T00:00:00.000Z",
    })
    const completed = resolveGoogleState({ _tag: "ResolvingGoogle" }, { _tag: "GoogleResolved", result: { _tag: "Existing", session } })
    expect(completed._tag).toBe("Completed")
    expect(location.search).toBe("?step=start&campaign=spring")
    expect(sessionStorage.getItem("unrelated")).toBe("kept")
    expect(JSON.stringify(sessionStorage)).not.toContain("token")
  })
})
