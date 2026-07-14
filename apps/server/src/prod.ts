import { Effect, Layer } from "effect"
import { StudyCatalogProdLive } from "./layers/study-catalog.prod.js"

const program = Effect.scoped(
  Effect.gen(function*() {
    yield* Layer.build(StudyCatalogProdLive)
    yield* Effect.log("[server] production services initialized with PostgreSQL")
  }),
)

await Effect.runPromise(program)
