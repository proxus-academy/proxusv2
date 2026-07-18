import type { FeatureFlagsBackendEvent } from "../modules/feature-flags/events.js"
export type { FeatureFlagSnapshotPublished } from "../modules/feature-flags/events.js"

/**
 * Global compile-time catalog of backend application events.
 * It is composed from module-owned event unions and deliberately says nothing
 * about queues, durability, ordering, replay, or process boundaries.
 */
export type BackendAppEvent = FeatureFlagsBackendEvent
