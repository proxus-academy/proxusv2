import { UgcRepository } from "@proxus/backend-domain/ugc-management"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { makeUgcRepositoryDrizzle } from "./repository.drizzle.js"

export const UgcRepositoryPgliteLive = Layer.effect(
  UgcRepository,
  PgliteDrizzle.makeWithDefaults().pipe(Effect.map(makeUgcRepositoryDrizzle)),
)
