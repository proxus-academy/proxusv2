import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { StudyCatalogRepository } from "../repository.js"
import { makeStudyCatalogRepositoryDrizzle } from "./repository.drizzle.js"

export const StudyCatalogRepositoryPgliteLive = Layer.effect(
  StudyCatalogRepository,
  PgliteDrizzle.makeWithDefaults().pipe(
    Effect.map(makeStudyCatalogRepositoryDrizzle),
  ),
)
