import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Context, Data, Duration, Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

export class FeatureFlagDistributionError extends Data.TaggedError("FeatureFlagDistributionError")<{ readonly cause: unknown }> {}

/** Platform-neutral port for obtaining the active public snapshot. */
export class FeatureFlagDistribution extends Context.Service<FeatureFlagDistribution, {
  readonly getActiveSnapshot: () => Effect.Effect<FeatureFlagSnapshot, FeatureFlagDistributionError>
}>()("@proxus/frontend-core/feature-flags/distribution/FeatureFlagDistribution") {}

/** Matches the public snapshot HTTP `max-age=60` cache policy. */
export const defaultFeatureFlagSnapshotRefreshInterval = Duration.seconds(60)

/**
 * Owns the snapshot query and its pull-based refresh lifecycle. Mounting the
 * lifecycle starts one read, then refreshes through the active AtomRegistry.
 */
export const makeFeatureFlagSnapshotModule = <R, ER = never>(
  runtime: Atom.AtomRuntime<FeatureFlagDistribution | R, ER>,
  options?: { readonly refreshInterval?: Duration.Input },
) => {
  const refreshInterval = Duration.fromInputUnsafe(
    options?.refreshInterval ?? defaultFeatureFlagSnapshotRefreshInterval,
  )
  if (!Duration.isFinite(refreshInterval) || !Duration.isPositive(refreshInterval)) {
    throw new TypeError("feature flag snapshot refresh interval must be finite and positive")
  }

  const snapshotAtom = runtime.atom(FeatureFlagDistribution.use(
    (distribution) => distribution.getActiveSnapshot(),
  ))
  const lifecycleAtom = runtime.atom(Effect.gen(function*() {
    const registry = yield* AtomRegistry.AtomRegistry
    yield* AtomRegistry.mount(registry, snapshotAtom)
    return yield* Effect.sleep(refreshInterval).pipe(
      Effect.andThen(Effect.sync(() => registry.refresh(snapshotAtom))),
      Effect.forever,
    )
  })).pipe(Atom.setIdleTTL(0))

  return { snapshotAtom, lifecycleAtom }
}
