import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"

/** Emitted only after an immutable snapshot revision has been persisted and activated. */
export interface FeatureFlagSnapshotPublished {
  readonly _tag: "FeatureFlagSnapshotPublished"
  readonly snapshot: FeatureFlagSnapshot
}

export type FeatureFlagsBackendEvent = FeatureFlagSnapshotPublished
