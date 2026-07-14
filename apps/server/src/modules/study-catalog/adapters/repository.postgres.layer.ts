import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { StudyCatalogRepository } from "../repository.js"
import { makeStudyCatalogRepositoryDrizzle } from "./repository.drizzle.js"

export const StudyCatalogRepositoryPostgresLive = Layer.effect(
  StudyCatalogRepository,
  PostgresDrizzle.makeWithDefaults().pipe(
    Effect.map(makeStudyCatalogRepositoryDrizzle),
  ),
)
