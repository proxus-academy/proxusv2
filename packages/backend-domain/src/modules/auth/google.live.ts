// @effect-diagnostics globalDateInEffect:off
import { Clock, Context, Effect, Layer, Option, Schema } from "effect"
import { GoogleIdentityProvider } from "./ports.js"
import { GoogleIdentityRejected, normalizeEmail, type GoogleCallback, type GoogleIntent, type IssuedSession, type VerifiedGoogleIdentity } from "./model.js"
import { AuthRepositoryError, InvalidRepositoryState, UserConflict, UserNotFound, UserRepository } from "./repositories.js"

export interface GoogleState { readonly intent: GoogleIntent; readonly nonce: string; readonly expiresAt: number }
export interface PendingGoogle { readonly subject: string; readonly email: string; readonly expiresAt: number }

export const GoogleStateSchema = Schema.Struct({
  intent: Schema.Literals(["login", "register"]),
  nonce: Schema.String.pipe(Schema.check(Schema.isMinLength(32))),
  expiresAt: Schema.Number,
}) satisfies Schema.Schema<GoogleState>
export const PendingGoogleSchema = Schema.Struct({
  subject: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  email: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  expiresAt: Schema.Number,
}) satisfies Schema.Schema<PendingGoogle>

export class GoogleSecurity extends Context.Service<GoogleSecurity, {
  readonly nonce: () => Effect.Effect<string>
  readonly signState: (value: GoogleState) => Effect.Effect<string>
  readonly verifyState: (token: string) => Effect.Effect<GoogleState, GoogleIdentityRejected>
  readonly signPending: (value: PendingGoogle) => Effect.Effect<string>
  readonly verifyPending: (token: string) => Effect.Effect<PendingGoogle, GoogleIdentityRejected>
}>()("@proxus/backend-domain/modules/auth/google.live/GoogleSecurity") {}

export class GoogleSessionIssuer extends Context.Service<GoogleSessionIssuer, {
  readonly issue: (userId: import("./model.js").UserId) => Effect.Effect<IssuedSession, AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/google.live/GoogleSessionIssuer") {}

export type GoogleResolution =
  | { readonly _tag: "Authenticated"; readonly session: IssuedSession }
  | { readonly _tag: "NewIdentity"; readonly pending: string; readonly email: string }
  | { readonly _tag: "EmailAccountNotActive" }

export class GoogleFlow extends Context.Service<GoogleFlow, {
  readonly start: (intent: GoogleIntent) => Effect.Effect<{ readonly url: string; readonly state: string }, GoogleIdentityRejected>
  /** Client profile/draft is deliberately not accepted. Identity comes only from provider exchange. */
  readonly complete: (callback: GoogleCallback) => Effect.Effect<GoogleResolution, GoogleIdentityRejected | AuthRepositoryError | UserConflict | UserNotFound | InvalidRepositoryState>
}>()("@proxus/backend-domain/modules/auth/google.live/GoogleFlow") {}

export const makeGoogleFlowLive = (options: { readonly stateTtlMillis: number; readonly pendingTtlMillis: number }) =>
  Layer.effect(GoogleFlow, Effect.gen(function*() {
    const provider = yield* GoogleIdentityProvider
    const security = yield* GoogleSecurity
    const users = yield* UserRepository
    const sessions = yield* GoogleSessionIssuer
    const now = () => Clock.currentTimeMillis
    const authenticate = (identity: VerifiedGoogleIdentity) => Effect.gen(function*() {
      const bySubject = yield* users.findByGoogleSubject(identity.subject)
      if (Option.isSome(bySubject)) {
        if (bySubject.value.status !== "active") return { _tag: "EmailAccountNotActive" } as const
        return { _tag: "Authenticated", session: yield* sessions.issue(bySubject.value.id) } as const
      }
      const byEmail = yield* users.findByEmail(normalizeEmail(identity.email))
      if (Option.isSome(byEmail)) {
        const user = byEmail.value
        if (user.status !== "active" || user.emailVerifiedAt === null) return { _tag: "EmailAccountNotActive" } as const
        const linked = yield* users.linkGoogle(user.id, identity.subject, new Date(yield* now()))
        return { _tag: "Authenticated", session: yield* sessions.issue(linked.id) } as const
      }
      const email = normalizeEmail(identity.email)
      return { _tag: "NewIdentity", email, pending: yield* security.signPending({
        subject: identity.subject, email, expiresAt: (yield* now()) + options.pendingTtlMillis,
      }) } as const
    })
    return GoogleFlow.of({
      start: (intent) => Effect.gen(function*() {
        const nonce = yield* security.nonce()
        const state = yield* security.signState({ intent, nonce, expiresAt: (yield* now()) + options.stateTtlMillis })
        return { state, url: yield* provider.authorizationUrl({ intent, state, nonce }) }
      }),
      complete: (callback) => Effect.gen(function*() {
        const state = yield* security.verifyState(callback.state)
        if (state.expiresAt <= (yield* now())) return yield* new GoogleIdentityRejected({ reason: "invalid-callback" })
        const identity = yield* provider.exchangeCallback(callback)
        // The provider must bind the code/token to the nonce encoded in state.
        if (!("nonce" in identity) || identity.nonce !== state.nonce) return yield* new GoogleIdentityRejected({ reason: "invalid-callback" })
        return yield* authenticate(identity)
      }),
    })
  }))
