import { randomInt } from "node:crypto"
import { Effect, Layer, Random } from "effect"
import { VerificationCodeGenerator, VerificationCodeGenerationError } from "@proxus/backend-domain/auth"

export const VerificationCodeGeneratorLive = Layer.effect(
  VerificationCodeGenerator,
  Effect.gen(function*() {
    const random = yield* Random.Random
    return VerificationCodeGenerator.of({
      generate: Effect.fn("VerificationCodeGenerator.generate")(() =>
        Effect.try({
          try: () => String(random.nextIntUnsafe()).padStart(6, "0"),
          catch: (cause) => new VerificationCodeGenerationError({ cause }),
        })),
    })
  }),
)

const CryptographicRandom = Layer.succeed(Random.Random, {
  nextIntUnsafe: () => randomInt(0, 1_000_000),
  nextDoubleUnsafe: () => randomInt(0, 2 ** 48) / 2 ** 48,
})

/** Deliberately predictable code for local development and disposable preview databases. */
export const DevelopmentVerificationCodeGeneratorLive = Layer.succeed(
  VerificationCodeGenerator,
  VerificationCodeGenerator.of({ generate: () => Effect.succeed("424242") }),
)

/** Production-ready generator: replaces Effect's non-cryptographic default Random. */
export const SecureVerificationCodeGeneratorLive = VerificationCodeGeneratorLive.pipe(
  Layer.provide(CryptographicRandom),
)
