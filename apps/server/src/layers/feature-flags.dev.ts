import { FeatureFlagsLive } from "@proxus/backend-domain/feature-flags"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { FeatureFlagSnapshotRepositoryPgliteLive } from "@proxus/backend-infra/feature-flags/pglite"
import { Layer } from "effect"

const PersistenceLive = Layer.merge(PgliteMigrationLive, FeatureFlagSnapshotRepositoryPgliteLive)
  .pipe(Layer.provide(PgliteDevelopmentLive))

export const FeatureFlagsDevLive = FeatureFlagsLive.pipe(Layer.provide(PersistenceLive))
