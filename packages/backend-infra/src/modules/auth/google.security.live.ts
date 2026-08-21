import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { GoogleIdentityRejected } from "@proxus/backend-domain/auth"
import { GoogleSecurity, GoogleStateSchema, PendingGoogleSchema } from "@proxus/backend-domain/auth/google-live"
import { Clock, Effect, Layer, Schema } from "effect"

const reject = () => new GoogleIdentityRejected({ reason: "invalid-callback" as const })
const encode = <A>(secret: string, value: A) => {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`
}
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))
const decode = (secret: string, token: string): typeof Schema.Json.Type => {
  const parts = token.split(".")
  if (parts.length !== 2 || parts[0] === undefined || parts[0] === "" || parts[1] === undefined || parts[1] === "") throw reject()
  const expected = createHmac("sha256", secret).update(parts[0]).digest()
  let supplied: Buffer
  try { supplied = Buffer.from(parts[1], "base64url") } catch { throw reject() }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw reject()
  try { return decodeJson(Buffer.from(parts[0], "base64url").toString("utf8")) } catch { throw reject() }
}
/** HMAC tokens are integrity protected, opaque to neither server nor client, and contain no profile data. */
export const makeGoogleSecurityLive = (secret: string) => {
  if (Buffer.byteLength(secret) < 32) throw new Error("Google signing secret must contain at least 32 bytes")
  const verify = <A extends { readonly expiresAt: number }>(token: string, schema: Schema.Codec<A, unknown, never>) => Effect.gen(function*() {
    const value = yield* Effect.try({ try: () => decode(secret, token), catch: reject })
    const decoded = yield* Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(reject))
    if (decoded.expiresAt <= (yield* Clock.currentTimeMillis)) return yield* reject()
    return decoded
  })
  return Layer.succeed(GoogleSecurity, GoogleSecurity.of({
    nonce: () => Effect.sync(() => randomBytes(24).toString("base64url")),
    signState: (value) => Effect.succeed(encode(secret, value)), verifyState: (token) => verify(token, GoogleStateSchema),
    signPending: (value) => Effect.succeed(encode(secret, value)), verifyPending: (token) => verify(token, PendingGoogleSchema),
  }))
}
