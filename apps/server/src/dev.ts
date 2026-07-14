import { Config, Effect } from "effect"

const program = Effect.gen(function*() {
  const port = yield* Config.number("PORT").pipe(Config.withDefault(3001))
  yield* Effect.log(`[server] shell ready on port ${port}; HTTP API pending`)
  return yield* Effect.never
})

await Effect.runPromise(program)
