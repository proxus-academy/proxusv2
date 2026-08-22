import { UgcRepository } from "@proxus/backend-domain/ugc-management"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { makeUgcRepositoryDrizzle } from "./repository.drizzle.js"

export const UgcRepositoryPostgresLive = Layer.effect(
  UgcRepository,
  PostgresDrizzle.makeWithDefaults().pipe(Effect.map(makeUgcRepositoryDrizzle)),
)
