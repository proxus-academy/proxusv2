import { Effect, Layer } from "effect"
import { StudyCatalogDevLive } from "./layers/study-catalog.dev.js"

const program = Effect.scoped(
  Effect.gen(function*() {
    yield* Layer.build(StudyCatalogDevLive)
    yield* Effect.log("[server] development services initialized with PGlite")
  }),
)

await Effect.runPromise(program)
