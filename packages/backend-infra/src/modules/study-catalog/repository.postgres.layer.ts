import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { StudyCatalogRepository } from "@proxus/backend-domain/study-catalog"
import { makeStudyCatalogRepositoryDrizzle } from "./repository.drizzle.js"

export const StudyCatalogRepositoryPostgresLive = Layer.effect(
  StudyCatalogRepository,
  PostgresDrizzle.makeWithDefaults().pipe(
    Effect.map(makeStudyCatalogRepositoryDrizzle),
  ),
)
