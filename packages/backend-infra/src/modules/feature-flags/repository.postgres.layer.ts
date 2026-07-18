import { FeatureFlagSnapshotRepository } from "@proxus/backend-domain/feature-flags"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { makeFeatureFlagSnapshotRepositoryDrizzle } from "./repository.drizzle.js"

export const FeatureFlagSnapshotRepositoryPostgresLive = Layer.effect(
  FeatureFlagSnapshotRepository,
  PostgresDrizzle.makeWithDefaults().pipe(Effect.map(makeFeatureFlagSnapshotRepositoryDrizzle)),
)
