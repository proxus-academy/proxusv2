import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Context, Effect } from "effect"
import type { FeatureFlagSnapshotRepositoryError } from "./repository.js"

export class FeatureFlagSnapshotReader extends Context.Service<FeatureFlagSnapshotReader, {
  readonly getActiveSnapshot: () => Effect.Effect<FeatureFlagSnapshot, FeatureFlagSnapshotRepositoryError>
}>()("@proxus/backend-domain/modules/feature-flags/service/FeatureFlagSnapshotReader") {}

export class FeatureFlagSnapshotPublisher extends Context.Service<FeatureFlagSnapshotPublisher, {
  readonly publishSnapshot: (snapshot: FeatureFlagSnapshot) => Effect.Effect<void, FeatureFlagSnapshotRepositoryError>
}>()("@proxus/backend-domain/modules/feature-flags/service/FeatureFlagSnapshotPublisher") {}
