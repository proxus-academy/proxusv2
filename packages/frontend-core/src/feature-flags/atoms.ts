import {
  evaluateFeatureFlag,
  type FeatureFlagDecision,
  defineFeatureFlag,
  type FeatureFlagDefinition,
  type FeatureFlagSnapshot,
} from "@proxus/shared/feature-flags"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"

/** Evaluates a distributed configuration only when every variant is known locally. */
export const evaluateSnapshotFeatureFlag = <A extends string>(
  localDefinition: FeatureFlagDefinition<A>,
  snapshot: FeatureFlagSnapshot,
  subjectId: string | null,
): FeatureFlagDecision<A> => {
  const remote = snapshot.flags.find((flag) => flag.key === localDefinition.key)
  if (remote === undefined) return evaluateFeatureFlag(localDefinition, subjectId)
  if (!remote.enabled) return evaluateFeatureFlag(localDefinition, null)
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
