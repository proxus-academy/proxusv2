import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { Effect, Layer } from "effect"
import { PasswordError, Passwords } from "@proxus/backend-domain/auth"

const algorithm = "scrypt"
const keyLength = 64
const saltLength = 16
const derive = (password: string, salt: Buffer, operation: "hash" | "verify") =>
  Effect.callback<Buffer, PasswordError>((resume) => {
    scrypt(password, salt, keyLength, { N: 16384, r: 8, p: 1 }, (cause, key) =>
      resume(cause === null
        ? Effect.succeed(key)
        : Effect.fail(new PasswordError({ operation, cause }))))
  })

export const PasswordsLive = Layer.succeed(Passwords, Passwords.of({
  hash: Effect.fn("Passwords.hash")((password: string) => Effect.gen(function*() {
    const salt = randomBytes(saltLength)
    const digest = yield* derive(password, salt, "hash")
    return `${algorithm}$16384$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`
  })),
  verify: Effect.fn("Passwords.verify")((password: string, encoded: string) => Effect.gen(function*() {
    const [name, n, r, p, saltText, digestText, extra] = encoded.split("$")
    if (name !== algorithm || n !== "16384" || r !== "8" || p !== "1" || saltText === undefined || saltText === "" || digestText === undefined || digestText === "" || extra !== undefined) return false
    const expected = Buffer.from(digestText, "base64url")
    if (expected.length !== keyLength || expected.toString("base64url") !== digestText) return false
    const salt = Buffer.from(saltText, "base64url")
    if (salt.length !== saltLength || salt.toString("base64url") !== saltText) return false
    const actual = yield* derive(password, salt, "verify")
    return timingSafeEqual(actual, expected)
  })),
}))
