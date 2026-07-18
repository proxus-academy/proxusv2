import { FeatureFlagSnapshotRepository } from "@proxus/backend-domain/feature-flags"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { makeFeatureFlagSnapshotRepositoryDrizzle } from "./repository.drizzle.js"

export const FeatureFlagSnapshotRepositoryPgliteLive = Layer.effect(
  FeatureFlagSnapshotRepository,
  PgliteDrizzle.makeWithDefaults().pipe(Effect.map(makeFeatureFlagSnapshotRepositoryDrizzle)),
)
