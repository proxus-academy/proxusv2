import {
  evaluateFeatureFlag,
  type FeatureFlagBootstrap,
  type FeatureFlagDecision,
  defineFeatureFlag,
  type FeatureFlagDefinition,
  type FeatureFlagSnapshot,
} from "@proxus/shared/feature-flags"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"

export interface FeatureFlagAtomOptions<A extends string, E = never> {
  readonly definition: FeatureFlagDefinition<A>
  readonly bootstrapAtom: Atom.Atom<AsyncResult.AsyncResult<FeatureFlagBootstrap, E>>
  readonly devOverrideAtom?: Atom.Atom<A | null>
  readonly enableDevOverrides?: boolean
}

/** Derives a decision without collapsing bootstrap loading or failure states. */
/** Evaluates a distributed configuration only when every variant is known locally. */
export const evaluateSnapshotFeatureFlag = <A extends string>(
  localDefinition: FeatureFlagDefinition<A>,
  snapshot: FeatureFlagSnapshot,
  subjectId: string | null,
): FeatureFlagDecision<A> => {
  const remote = snapshot.flags.find((flag) => flag.key === localDefinition.key)
  if (remote === undefined) return evaluateFeatureFlag(localDefinition, subjectId)
  const known = new Set(localDefinition.variants.map(([value]) => value))
  if (!known.has(remote.default as A) || remote.variants.some(({ value }) => !known.has(value as A))) {
    return evaluateFeatureFlag(localDefinition, null)
  }
  try {
    return evaluateFeatureFlag(defineFeatureFlag({
      key: remote.key,
      allocationVersion: remote.allocationVersion,
      assignmentUnit: "installation",
      default: remote.default as A,
      variants: remote.variants.map(({ value, weight }) => [value as A, weight] as const),
    }), subjectId)
  } catch {
    return evaluateFeatureFlag(localDefinition, null)
  }
}

export const makeSnapshotFeatureFlagDecisionAtom = <A extends string, E = never>(options: {
  readonly definition: FeatureFlagDefinition<A>
  readonly snapshotAtom: Atom.Atom<AsyncResult.AsyncResult<FeatureFlagSnapshot, E>>
  readonly subjectIdAtom: Atom.Atom<string | null>
}) => Atom.make((get) => AsyncResult.map(
  get(options.snapshotAtom),
  (snapshot) => evaluateSnapshotFeatureFlag(options.definition, snapshot, get(options.subjectIdAtom)),
))

export const makeFeatureFlagDecisionAtom = <A extends string, E = never>({
  definition,
  bootstrapAtom,
  devOverrideAtom,
  enableDevOverrides = false,
}: FeatureFlagAtomOptions<A, E>): Atom.Atom<
  AsyncResult.AsyncResult<FeatureFlagDecision<A>, E>
> =>
  Atom.make((get) =>
    AsyncResult.map(get(bootstrapAtom), (bootstrap) => {
      if (enableDevOverrides && devOverrideAtom !== undefined) {
        const override = get(devOverrideAtom)
        if (
          override !== null &&
          definition.variants.some(([value]) => value === override)
        ) {
          return {
            key: definition.key,
            value: override,
            allocationVersion: definition.allocationVersion,
            source: "dev-override" as const,
          }
        }
      }
      return evaluateFeatureFlag(definition, bootstrap.subjectId)
    }),
  )
