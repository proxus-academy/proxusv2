import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { GoogleIdentityRejected } from "@proxus/backend-domain/auth"
import { GoogleSecurity, type GoogleState, type PendingGoogle } from "@proxus/backend-domain/auth/google-live"
import { Clock, Effect, Layer } from "effect"

const reject = () => new GoogleIdentityRejected({ reason: "invalid-callback" as const })
const encode = (secret: string, value: unknown) => {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`
}
const decode = (secret: string, token: string): unknown => {
  const parts = token.split(".")
  if (parts.length !== 2 || parts[0] === undefined || parts[0] === "" || parts[1] === undefined || parts[1] === "") throw reject()
  const expected = createHmac("sha256", secret).update(parts[0]).digest()
  let supplied: Buffer
  try { supplied = Buffer.from(parts[1], "base64url") } catch { throw reject() }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw reject()
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) } catch { throw reject() }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

/** HMAC tokens are integrity protected, opaque to neither server nor client, and contain no profile data. */
export const makeGoogleSecurityLive = (secret: string) => {
  if (Buffer.byteLength(secret) < 32) throw new Error("Google signing secret must contain at least 32 bytes")
  const verify = <A extends { readonly expiresAt: number }>(token: string, guard: (value: unknown) => value is A) => Effect.gen(function*() {
    const value = yield* Effect.try({ try: () => decode(secret, token), catch: reject })
    if (!guard(value) || value.expiresAt <= (yield* Clock.currentTimeMillis)) return yield* reject()
    return value
  })
  const state = (value: unknown): value is GoogleState => record(value) && (value.intent === "login" || value.intent === "register") && typeof value.nonce === "string" && value.nonce.length >= 32 && typeof value.expiresAt === "number"
  const pending = (value: unknown): value is PendingGoogle => record(value) && typeof value.subject === "string" && value.subject.length > 0 && typeof value.email === "string" && value.email.length > 0 && typeof value.expiresAt === "number"
  return Layer.succeed(GoogleSecurity, GoogleSecurity.of({
    nonce: () => Effect.sync(() => randomBytes(24).toString("base64url")),
    signState: (value) => Effect.succeed(encode(secret, value)), verifyState: (token) => verify(token, state),
    signPending: (value) => Effect.succeed(encode(secret, value)), verifyPending: (token) => verify(token, pending),
  }))
}
