import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Context, Data, Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export class FeatureFlagDistributionError extends Data.TaggedError("FeatureFlagDistributionError")<{ readonly cause: unknown }> {}

/** Platform-neutral port for obtaining the active public snapshot. */
export class FeatureFlagDistribution extends Context.Service<FeatureFlagDistribution, {
  readonly getActiveSnapshot: () => Effect.Effect<FeatureFlagSnapshot, FeatureFlagDistributionError>
}>()("@proxus/frontend-core/feature-flags/distribution/FeatureFlagDistribution") {}

export const makeFeatureFlagSnapshotAtom = (runtime: Atom.AtomRuntime<FeatureFlagDistribution>) =>
  runtime.atom(Effect.gen(function*() {
    return yield* (yield* FeatureFlagDistribution).getActiveSnapshot()
  }))
