// @effect-diagnostics asyncFunction:off strictEffectProvide:off globalDateInEffect:off
import { describe, expect, it, vi } from "vitest"
import { DateTime, Effect, Layer, Random, Ref } from "effect"
import { EmailDelivery, Passwords, VerificationCodeGenerator } from "@proxus/backend-domain/auth"
import { consoleEmailSink, makeConsoleEmailDelivery, ProductionEmailDeliveryUnavailable, type ConsoleEmailRecord } from "./email.console.js"
import { PasswordsLive } from "./passwords.live.js"
import { DevelopmentVerificationCodeGeneratorLive, VerificationCodeGeneratorLive } from "./verification-code.live.js"

const runPasswords = <A, E>(effect: Effect.Effect<A, E, Passwords>) =>
  Effect.runPromise(effect.pipe(Effect.provide(PasswordsLive)))

describe("PasswordsLive", () => {
  it("creates nondeterministic hashes that verify without containing the password", async () => {
    const password = "correct horse battery staple"
    const [first, second] = await runPasswords(Effect.gen(function*() {
      const passwords = yield* Passwords
      return [yield* passwords.hash(password), yield* passwords.hash(password)] as const
    }))

    expect(first).not.toBe(second)
    expect(first).not.toContain(password)
    expect(await runPasswords(Effect.flatMap(Passwords, (passwords) => passwords.verify(password, first)))).toBe(true)
    expect(await runPasswords(Effect.flatMap(Passwords, (passwords) => passwords.verify("wrong", first)))).toBe(false)
  })
})

describe("VerificationCodeGeneratorLive", () => {
  it("maps an injected Random sequence to zero-padded six-digit codes", async () => {
    const values = [0, 7, 42, 999_999]
    let index = 0
    const fakeRandom: typeof Random.Random.Service = {
      nextIntUnsafe: () => values[index++] ?? 0,
      nextDoubleUnsafe: () => 0,
    }
    const codes = await Effect.runPromise(Effect.gen(function*() {
      const generator = yield* VerificationCodeGenerator
      return yield* Effect.forEach(values, () => generator.generate())
    }).pipe(
      Effect.provide(VerificationCodeGeneratorLive),
      Effect.provideService(Random.Random, fakeRandom),
    ))

    expect(codes).toEqual(["000000", "000007", "000042", "999999"])
    for (const code of codes) expect(code).toMatch(/^\d{6}$/)
  })

  it("uses the documented fixed code in development and previews", async () => {
    const code = await Effect.runPromise(Effect.flatMap(
      VerificationCodeGenerator,
      (generator) => generator.generate(),
    ).pipe(Effect.provide(DevelopmentVerificationCodeGeneratorLive)))

    expect(code).toBe("424242")
  })
})

describe("ConsoleEmailDelivery", () => {
  it("exposes secrets only to the explicit capturable sink, not normal logs", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const records = await Effect.runPromise(Effect.gen(function*() {
      const captured = yield* Ref.make<ReadonlyArray<ConsoleEmailRecord>>([])
      const layer = makeConsoleEmailDelivery((record) => Ref.update(captured, (all) => [...all, record]))
      yield* Effect.gen(function*() {
        const delivery = yield* EmailDelivery
        yield* delivery.sendVerification({
          recipient: "person@example.test",
          purpose: "verify-email",
          code: "123456",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        })
      }).pipe(Effect.provide(layer))
      return yield* Ref.get(captured)
    }))

    expect(records).toHaveLength(1)
    expect(records[0]?.code).toBe("123456")
    expect(consoleLog).not.toHaveBeenCalled()
    consoleLog.mockRestore()
  })

  it("prints a searchable development reset code through the default sink", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined)
    await Effect.runPromise(consoleEmailSink({ recipient: "student@example.test", purpose: "reset-password", code: "654321", expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe("2030-01-01T00:00:00Z")) }))
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("purpose=reset-password"))
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("code=654321"))
    consoleLog.mockRestore()
  })

  it("fails while building the production placeholder", async () => {
    const exit = await Effect.runPromiseExit(Layer.build(ProductionEmailDeliveryUnavailable).pipe(Effect.scoped))
    expect(exit._tag).toBe("Failure")
  })
})
