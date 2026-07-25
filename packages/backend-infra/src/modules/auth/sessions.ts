import { randomInt } from "node:crypto"
import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
// @effect-diagnostics globalDate:off globalDateInEffect:off outdatedApi:off
import { Clock, Context, Effect, Layer, Option, Random } from "effect"
import { SessionRepository, makeSessionId, type AuthSession, type IssuedSession, type UserId } from "@proxus/backend-domain/auth"

export interface SessionPolicy {
  readonly ttlMillis: number
  readonly renewalWindowMillis: number
  readonly rotationGraceMillis: number
}

export type ResolvedSession =
  | { readonly _tag: "Active"; readonly session: AuthSession }
  | { readonly _tag: "Rotated"; readonly session: AuthSession; readonly token: string }
  | { readonly _tag: "Grace"; readonly session: AuthSession }
  | { readonly _tag: "Missing" }

export class OpaqueSessions extends Context.Service<OpaqueSessions, {
  readonly create: (userId: UserId) => Effect.Effect<IssuedSession, import("@proxus/backend-domain/auth").AuthRepositoryError>
  readonly resolve: (token: string) => Effect.Effect<ResolvedSession, import("@proxus/backend-domain/auth").AuthRepositoryError>
}>()("@proxus/backend-infra/modules/auth/sessions/OpaqueSessions") {}

export const hashSessionToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("base64url")

const randomBytes = (random: typeof Random.Random.Service, length: number) => {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index++) bytes[index] = Math.abs(random.nextIntUnsafe()) % 256
  return bytes
}

const uuidFromBytes = (bytes: Uint8Array) => {
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x40
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const makeOpaqueSessionsLive = (policy: SessionPolicy) => Layer.effect(OpaqueSessions, Effect.gen(function*() {
  const repository = yield* SessionRepository
  const random = yield* Random.Random
  const token = () => Buffer.from(randomBytes(random, 32)).toString("base64url")
  const now = () => Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis)))
  return OpaqueSessions.of({
    create: (userId) => Effect.gen(function*() {
      const createdAt = yield* now()
      const secret = token()
      const session = yield* repository.create({
        id: makeSessionId(uuidFromBytes(randomBytes(random, 16))), userId,
        tokenHash: hashSessionToken(secret), previousTokenHash: null, previousTokenValidUntil: null,
        expiresAt: new Date(createdAt.getTime() + policy.ttlMillis), revokedAt: null, createdAt,
      })
      return { session, token: secret }
    }),
    resolve: (secret) => Effect.gen(function*() {
      const checkedAt = yield* now()
      const presentedTokenHash = hashSessionToken(secret)
      const found = yield* repository.findActiveByTokenHash(presentedTokenHash, checkedAt)
      if (Option.isNone(found)) return { _tag: "Missing" } as const
      const session = found.value
      if (session.tokenHash !== presentedTokenHash) return { _tag: "Grace", session } as const
      if (session.expiresAt.getTime() - checkedAt.getTime() > policy.renewalWindowMillis) return { _tag: "Active", session } as const
      const nextToken = token()
      const rotation = yield* repository.rotate({ id: session.id, presentedTokenHash, nextTokenHash: hashSessionToken(nextToken), now: checkedAt,
        expiresAt: new Date(checkedAt.getTime() + policy.ttlMillis), previousTokenValidUntil: new Date(checkedAt.getTime() + policy.rotationGraceMillis) })
      if (rotation._tag === "Rotated") return { _tag: "Rotated", session: rotation.session, token: nextToken } as const
      if (rotation._tag === "AlreadyRotated") return { _tag: "Grace", session: rotation.session } as const
      return { _tag: "Missing" } as const
    }),
  })
}))

export const SecureSessionRandomLive = Layer.succeed(Random.Random, {
  nextIntUnsafe: () => randomInt(-2_147_483_648, 2_147_483_647),
  nextDoubleUnsafe: () => randomInt(0, 2 ** 48) / 2 ** 48,
})
