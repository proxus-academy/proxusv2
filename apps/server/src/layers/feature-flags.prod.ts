import { FeatureFlagsLive } from "@proxus/backend-domain/feature-flags"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { FeatureFlagSnapshotRepositoryPostgresLive } from "@proxus/backend-infra/feature-flags/postgres"
import { Layer } from "effect"

const PersistenceLive = Layer.merge(PostgresMigrationCheckLive, FeatureFlagSnapshotRepositoryPostgresLive)
  .pipe(Layer.provide(makePostgresProductionLive("proxus-server-feature-flags")))

export const FeatureFlagsProdLive = FeatureFlagsLive.pipe(Layer.provide(PersistenceLive))
