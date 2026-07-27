// @vitest-environment happy-dom
import { RegistryProvider } from "@effect/atom-react"
import type { RegistrationDraft, RegistrationState } from "@proxus/frontend-core/registration"
import { makeFeatureFlagSubjectId } from "@proxus/shared/feature-flags"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  registrationLandingAssignmentAtom,
  registrationLandingExposureLifecycleAtom,
} from "./feature-flags.js"
import { RegistrationOnboarding } from "./onboarding-flow.js"
import {
  googleRegistrationDraftAtom,
  registrationStateAtom,
} from "./state.js"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const emailDraft: RegistrationDraft = { provider: "email", path: [] }
let host: HTMLDivElement
let root: Root
let renderKey = 0

const render = (state: RegistrationState, googleEmail?: string) => {
  const initialValues = [
    Atom.initialValue(registrationStateAtom, state),
    Atom.initialValue(registrationLandingAssignmentAtom, AsyncResult.success({
      flagKey: "registration.landing",
      variant: "short",
      revision: 0,
      subject: makeFeatureFlagSubjectId("00000000-0000-4000-8000-000000000001"),
    })),
    Atom.initialValue(registrationLandingExposureLifecycleAtom, AsyncResult.success(undefined)),
    ...(googleEmail === undefined
      ? []
      : [Atom.initialValue(googleRegistrationDraftAtom, {
          registrationId: "registration-id",
          email: googleEmail,
        })]),
  ]
  renderKey++
  return Effect.promise(() => act(() => {
    root.render(
      <RegistryProvider key={renderKey} initialValues={initialValues}>
        <RegistrationOnboarding />
      </RegistryProvider>,
    )
    return Effect.runPromise(Effect.sleep("10 millis"))
  }))
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(
    "{\"accepted\":true}",
    { status: 202, headers: { "content-type": "application/json" } },
  ))))
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe("public registration onboarding", () => {
  it("offers explicit Google, email and login choices", () => Effect.runPromise(Effect.gen(function*() {
    yield* render({ _tag: "ChoosingMethod" })
    expect(host.textContent).toContain("Continuar con Google")
    expect(host.textContent).toContain("Empezar con email")
    expect(host.textContent).toContain("Ya tengo cuenta")
  })))

  it("renders the problem step without a screen-wide action bag", () => Effect.runPromise(Effect.gen(function*() {
    yield* render({ _tag: "CollectingOnboarding", draft: emailDraft, step: "problem" })
    expect(host.querySelector('input[value="other"]')).not.toBeNull()
    expect(host.querySelector("textarea")).not.toBeNull()
    expect(host.textContent).toContain("¿Qué quieres resolver?")
  })))

  it("shows editable summary data on the account step", () => Effect.runPromise(Effect.gen(function*() {
    yield* render({
      _tag: "CollectingOnboarding",
      draft: {
        ...emailDraft,
        problemKind: "prepare-exams",
        username: "alumna_1",
        birthYear: 2001,
      },
      step: "account",
    })
    expect(host.textContent).toContain("Preparar exámenes")
    expect(host.textContent).toContain("alumna_1, 2001")
    expect(host.textContent).toContain("Editar problema")
  })))

  it("renders verification and Google confirmation as explicit variants", () => Effect.runPromise(Effect.gen(function*() {
    yield* render({
      _tag: "EmailVerificationPending",
      draftId: "opaque",
      maskedEmail: "a***@example.test",
    })
    expect(host.textContent).toContain("a***@example.test")
    expect(host.textContent).toContain("Reenviar código")

    yield* render({
      _tag: "ConfirmingGoogle",
      draft: {
        provider: "google",
        path: [],
        problemKind: "organize-study",
        username: "student_1",
        birthYear: 2000,
      },
    }, "verified@example.test")
    expect(host.textContent).toContain("verified@example.test")
    expect(host.textContent).not.toContain("Contraseña")
  })))
})
