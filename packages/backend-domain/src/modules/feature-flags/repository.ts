import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Context, Data, Effect } from "effect"

export class FeatureFlagSnapshotRepositoryError extends Data.TaggedError("FeatureFlagSnapshotRepositoryError")<{
  readonly operation: "readActive" | "publish"
  readonly cause?: unknown
}> {}

export class FeatureFlagSnapshotRepository extends Context.Service<FeatureFlagSnapshotRepository, {
  /** Reads the single active snapshot as one value; absence is represented by null. */
  readonly readActive: () => Effect.Effect<FeatureFlagSnapshot | null, FeatureFlagSnapshotRepositoryError>
  /** Inserts a new immutable revision and activates it in the same transaction. */
  readonly publish: (snapshot: FeatureFlagSnapshot) => Effect.Effect<void, FeatureFlagSnapshotRepositoryError>
}>()("@proxus/backend-domain/modules/feature-flags/repository/FeatureFlagSnapshotRepository") {}
