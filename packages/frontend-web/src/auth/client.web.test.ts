import { AuthClient, AuthUnauthorized } from "@proxus/frontend-core/auth"
import { CurrentSession } from "@proxus/shared/auth"
import { Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AuthWebTransportError, authWebClientLayer, type AuthWebTransport } from "./client.web.js"

const current = Schema.decodeUnknownSync(CurrentSession)({
  sessionId: "00000000-0000-4000-8000-000000000002",
  account: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "student@example.com",
    username: "student_1",
    status: "active",
    provider: "email",
  },
  expiresAt: "2030-01-01T00:00:00.000Z",
})

const unused = () => Effect.die("unused fake transport operation")
const fake = (currentSession: AuthWebTransport["currentSession"]): AuthWebTransport => ({
  currentSession,
  login: unused,
  registerWithEmail: unused,
  verifyEmail: unused,
  resendVerification: unused,
  startGoogle: unused,
  completeGoogleCallback: unused,
  completeGoogleRegistration: unused,
  logout: unused,
  requestPasswordReset: unused,
  resetPassword: unused,
})

describe("auth web client", () => {
  it("restores contract-shaped sessions through an injected transport", () => Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(authWebClientLayer(fake(() => Effect.succeed(current))))
      const result = yield* AuthClient.use((client) => client.currentSession()).pipe(Effect.provide(context))
      expect(result).toEqual(current)
    })),
  ))

  it("maps a transport 401 to the common anonymous signal", () => Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(authWebClientLayer(fake(() => Effect.fail(
        new AuthWebTransportError({ status: 401, cause: "expired cookie" }),
      ))))
      const result = yield* AuthClient.use((client) => client.currentSession()).pipe(
        Effect.flip,
        Effect.provide(context),
      )
      expect(result).toBeInstanceOf(AuthUnauthorized)
    })),
  ))
})
