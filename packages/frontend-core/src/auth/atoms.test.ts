import { AuthRequestAccepted, CurrentSession, ExistingGoogleSession, GoogleAuthorization, RequestPasswordResetInput, ResetPasswordInput, Unauthorized } from "@proxus/shared/auth"
import { Effect, Layer, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { makePublicApiClientLayer } from "../public-api/client.js"
import { makeAuthAtoms } from "./atoms.js"

const session = (sessionId: string) => Schema.decodeUnknownSync(CurrentSession)({
  sessionId,
  account: { id: "00000000-0000-4000-8000-000000000001", email: "student@example.com", username: "student_1", status: "active", provider: "email" },
  expiresAt: "2030-01-01T00:00:00.000Z",
})
const first = session("00000000-0000-4000-8000-000000000002")
const rotated = session("00000000-0000-4000-8000-000000000003")
const requestInput = Schema.decodeUnknownSync(RequestPasswordResetInput)({ email: "student@example.com" })
const resetInput = Schema.decodeUnknownSync(ResetPasswordInput)({ email: "student@example.com", code: "123456", password: "new-long-password" })
const accepted = new AuthRequestAccepted({ accepted: true })
const authorization = new GoogleAuthorization({ authorizationUrl: "http://fake-google.local/authorize?state=signed" })

const json = <A>(value: A, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })

const setup = (options: { readonly unauthorizedSession?: boolean; readonly failSession?: boolean } = {}) => {
  let current = first
  const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
  const client = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      const path = new URL(request.url, "http://test.local").pathname
      let response: Response
      if (path === "/api/auth/session") {
        if (options.failSession === true) response = new Response(null, { status: 500 })
        else if (options.unauthorizedSession === true) response = json(Schema.encodeSync(Unauthorized)(new Unauthorized({})), 401)
        else response = json(current)
      } else if (path === "/api/auth/google/start") response = json(authorization)
      else if (path === "/api/auth/google/callback") response = json(new ExistingGoogleSession({ session: first }))
      else if (path === "/api/auth/logout") response = new Response(null, { status: 204 })
      else response = json(accepted, path.endsWith("/register/email") || path.endsWith("/password-reset/request") ? 202 : 200)
      return HttpClientResponse.fromWeb(request, response)
    }),
    preprocess,
  )
  const runtime = Atom.runtime(
    makePublicApiClientLayer("/api").pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
    ),
  )
  const atoms = makeAuthAtoms(runtime)
  const registry = AtomRegistry.make()
  registry.mount(atoms.restoreSessionAtom)
  registry.mount(atoms.startGoogleAtom)
  registry.mount(atoms.completeGoogleCallbackAtom)
  registry.mount(atoms.requestPasswordResetAtom)
  registry.mount(atoms.resetPasswordAtom)
  return { atoms, registry, rotate: () => { current = rotated } }
}

const flush = Effect.sleep("10 millis")

describe("legacy auth atoms using the typed PublicApi client", () => {
  it("restores a session and preserves transport failures", () => Effect.runPromise(Effect.gen(function*() {
    const loaded = setup()
    loaded.registry.set(loaded.atoms.restoreSessionAtom, undefined)
    yield* flush
    expect(AsyncResult.getOrThrow(loaded.registry.get(loaded.atoms.sessionAtom))).toEqual(first)

    const offline = setup({ failSession: true })
    offline.registry.set(offline.atoms.restoreSessionAtom, undefined)
    yield* flush
    expect(offline.registry.get(offline.atoms.sessionAtom)).toMatchObject({ _tag: "Failure" })
  })))

  it("turns a typed Unauthorized response into anonymous", () => Effect.runPromise(Effect.gen(function*() {
    const setupResult = setup({ unauthorizedSession: true })
    setupResult.registry.set(setupResult.atoms.restoreSessionAtom, undefined)
    yield* flush
    expect(AsyncResult.getOrThrow(setupResult.registry.get(setupResult.atoms.sessionAtom))).toBeNull()
  })))

  it("supports Google, cookie rotation, and password reset endpoints", () => Effect.runPromise(Effect.gen(function*() {
    const { atoms, registry, rotate } = setup()
    let assigned = ""
    registry.set(atoms.startGoogleAtom, (url) => { assigned = url })
    registry.set(atoms.completeGoogleCallbackAtom, { input: { code: "dev-google", state: "signed" }, onSuccess: () => undefined })
    registry.set(atoms.requestPasswordResetAtom, requestInput)
    registry.set(atoms.resetPasswordAtom, resetInput)
    yield* flush
    expect(assigned).toBe(authorization.authorizationUrl)
    expect(AsyncResult.getOrThrow(registry.get(atoms.sessionAtom))).toEqual(first)
    rotate()
    registry.set(atoms.restoreSessionAtom, undefined)
    yield* flush
    expect(AsyncResult.getOrThrow(registry.get(atoms.sessionAtom))).toEqual(rotated)
  })))
})
