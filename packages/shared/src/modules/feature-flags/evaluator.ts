import {
  parseFeatureFlagSubjectId,
  type FeatureFlagDecision,
  type FeatureFlagDefinition,
  type FeatureFlagSubjectId,
} from "./model.js"

const FNV1A_OFFSET_BASIS_32 = 0x811c9dc5
const FNV1A_PRIME_32 = 0x01000193

/** FNV-1a 32-bit over the UTF-8 bytes of `input`. */
export const fnv1aUtf8 = (input: string): number => {
  let hash = FNV1A_OFFSET_BASIS_32
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= byte
    hash = Math.imul(hash, FNV1A_PRIME_32)
  }
  return hash >>> 0
}

export const featureFlagBucket = <A extends string>(
  definition: FeatureFlagDefinition<A>,
  subjectId: FeatureFlagSubjectId,
): number =>
  fnv1aUtf8(
    `proxus-ff:v1:${definition.key}:${definition.allocationVersion}:${subjectId}`,
  ) % 10_000

export const evaluateFeatureFlag = <A extends string>(
  definition: FeatureFlagDefinition<A>,
  subjectId: string | null | undefined,
): FeatureFlagDecision<A> => {
  const fallback = (): FeatureFlagDecision<A> => ({
    key: definition.key,
    value: definition.default,
    allocationVersion: definition.allocationVersion,
    source: "default",
  })

  const validSubjectId = parseFeatureFlagSubjectId(subjectId)
  if (validSubjectId === null) return fallback()

  const bucket = featureFlagBucket(definition, validSubjectId)
  let upperBound = 0
  for (const [value, weight] of definition.variants) {
    upperBound += weight
    if (bucket < upperBound) {
      return {
        key: definition.key,
        value,
        allocationVersion: definition.allocationVersion,
        source: "allocation",
      }
    }
  }
  return fallback()
}
