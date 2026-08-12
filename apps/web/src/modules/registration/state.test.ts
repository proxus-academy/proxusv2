// @vitest-environment happy-dom
import { applicationRuntime } from "@proxus/frontend-core/runtime"
import { makePublicApiClientLayer } from "@proxus/frontend-core/public-api"
import { CurrentSession, ExistingGoogleSession } from "@proxus/shared/auth"
import { Effect, Layer, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"

const session = Schema.decodeUnknownSync(CurrentSession)({
  sessionId: "00000000-0000-4000-8000-000000000002",
  account: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "student@example.com",
    username: "student_1",
    status: "active",
    provider: "google",
  },
  expiresAt: "2030-01-01T00:00:00.000Z",
})

describe("web registration state", () => {
  it("resumes Google OAuth after a document navigation and removes callback secrets", () => Effect.runPromise(Effect.gen(function*() {
    history.replaceState(null, "", "/es?code=oauth-code&state=signed&campaign=spring")
    const { router } = yield* Effect.promise(() => import("../../routes/router.js"))
    yield* Effect.promise(() => router.load())
    const stateModule = yield* Effect.promise(() => import("./state.js"))
    const responseBody = new ExistingGoogleSession({ session })
    const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
    const client = HttpClient.makeWith(
      Effect.fnUntraced(function*(requestEffect) {
        const request = yield* requestEffect
        return HttpClientResponse.fromWeb(request, Response.json(responseBody))
      }),
      preprocess,
    )
    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(
          applicationRuntime.layer,
          Layer.merge(
            makePublicApiClientLayer("/api").pipe(
              Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
            ),
            Reactivity.layer,
          ),
        ),
        Atom.initialValue(stateModule.registrationStateAtom, { _tag: "ChoosingMethod" }),
      ],
    })
    registry.mount(stateModule.dispatchRegistrationAction)
    registry.mount(stateModule.resolveGoogleCallbackAction)
    registry.set(stateModule.dispatchRegistrationAction, { _tag: "GoogleStarted" })
    yield* AtomRegistry.getResult(registry, stateModule.dispatchRegistrationAction, { suspendOnWaiting: true })
    expect(registry.get(stateModule.registrationStateAtom)).toEqual({ _tag: "ResolvingGoogle" })
    registry.set(stateModule.registrationStateAtom, { _tag: "ChoosingMethod" })
    registry.set(stateModule.resolveGoogleCallbackAction, { code: "oauth-code", state: "signed" })
    yield* AtomRegistry.getResult(registry, stateModule.resolveGoogleCallbackAction, { suspendOnWaiting: true })

    expect(AsyncResult.getOrThrow(registry.get(stateModule.resolveGoogleCallbackAction))).toBe("existing")
    expect(registry.get(stateModule.registrationStateAtom)).toEqual({ _tag: "Completed", session })
    // The route owns secret cleanup and navigation after observing this explicit result.
    expect(location.pathname).toBe("/es")
    expect(new URLSearchParams(location.search).get("code")).toBe("oauth-code")
    expect(new URLSearchParams(location.search).get("state")).toBe("signed")
  })))
})
