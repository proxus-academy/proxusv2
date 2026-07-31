import { GoogleIdentityProvider, GoogleIdentityRejected, type VerifiedGoogleIdentity } from "@proxus/backend-domain/auth"
import { Effect, Layer, Ref } from "effect"

export interface FakeGoogleCode { readonly code: string; readonly identity: Omit<VerifiedGoogleIdentity, "nonce"> }

/** Deterministic local authorization-code provider. Codes are configured by tests/dev, never client profiles. */
export const makeFakeGoogleIdentityProvider = (codes: ReadonlyArray<FakeGoogleCode>, callbackUrl = "/es") =>
  Layer.effect(GoogleIdentityProvider, Effect.gen(function*() {
    const issued = yield* Ref.make(new Map<string, string>())
    const identities = new Map(codes.map((entry) => [entry.code, entry.identity]))
    const defaultCode = codes[0]?.code
    return GoogleIdentityProvider.of({
      authorizationUrl: (request) => defaultCode === undefined
        ? Effect.fail(new GoogleIdentityRejected({ reason: "provider-failure" }))
        : Ref.update(issued, (current) => new Map(current).set(request.state, request.nonce)).pipe(
          Effect.as(`${callbackUrl}?code=${encodeURIComponent(defaultCode)}&state=${encodeURIComponent(request.state)}`),
        ),
      exchangeCallback: ({ code, state }) => Effect.gen(function*() {
        const identity = identities.get(code)
        const nonce = (yield* Ref.get(issued)).get(state)
        if (identity === undefined || nonce === undefined) return yield* new GoogleIdentityRejected({ reason: "invalid-callback" })
        if (!identity.emailVerified) return yield* new GoogleIdentityRejected({ reason: "unverified-email" })
        return { ...identity, nonce }
      }),
    })
  }))
