import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Context, Effect } from "effect"
import type { FeatureFlagSnapshotRepositoryError } from "./repository.js"

export class FeatureFlags extends Context.Service<FeatureFlags, {
  readonly getActiveSnapshot: () => Effect.Effect<FeatureFlagSnapshot, FeatureFlagSnapshotRepositoryError>
  readonly publishSnapshot: (snapshot: FeatureFlagSnapshot) => Effect.Effect<void, FeatureFlagSnapshotRepositoryError>
}>()("@proxus/backend-domain/modules/feature-flags/service/FeatureFlags") {}
