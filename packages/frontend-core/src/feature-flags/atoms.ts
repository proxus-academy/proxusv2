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
  const safeDefault = () => evaluateFeatureFlag(localDefinition, null)
  const isLocalVariant = (value: string): value is A =>
    localDefinition.variants.some(([localValue]) => localValue === value)

  const remote = snapshot.flags.find((flag) => flag.key === localDefinition.key)
  if (remote === undefined || !remote.enabled) return safeDefault()

  const remoteDefault = remote.default
  if (!isLocalVariant(remoteDefault)) return safeDefault()

  const variants: Array<readonly [value: A, weight: number]> = []
  for (const remoteVariant of remote.variants) {
    if (!isLocalVariant(remoteVariant.value)) return safeDefault()
    variants.push([remoteVariant.value, remoteVariant.weight])
  }

  return evaluateFeatureFlag(defineFeatureFlag({
    key: remote.key,
    allocationVersion: remote.allocationVersion,
    assignmentUnit: "installation",
    default: remoteDefault,
    variants,
  }), subjectId)
}

export const makeSnapshotFeatureFlagDecisionAtom = <A extends string, E = never>(options: {
  readonly definition: FeatureFlagDefinition<A>
  readonly snapshotAtom: Atom.Atom<AsyncResult.AsyncResult<FeatureFlagSnapshot, E>>
  readonly subjectIdAtom: Atom.Atom<string | null>
}) => Atom.make((get) => AsyncResult.map(
  get(options.snapshotAtom),
  (snapshot) => evaluateSnapshotFeatureFlag(options.definition, snapshot, get(options.subjectIdAtom)),
))
