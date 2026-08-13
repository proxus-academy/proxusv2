import { Option, Schema } from "effect"

const featureFlagDefinitionTypeId: unique symbol = Symbol.for(
  "@proxus/shared/FeatureFlagDefinition",
)
const FEATURE_FLAG_KEY = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/

export const FeatureFlagSubjectId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("FeatureFlagSubjectId"),
)
export type FeatureFlagSubjectId = typeof FeatureFlagSubjectId.Type

export interface FeatureFlagDefinition<A extends string> {
  readonly [featureFlagDefinitionTypeId]: true
  readonly key: string
  readonly allocationVersion: number
  readonly assignmentUnit: "installation"
  readonly default: A
  readonly variants: ReadonlyArray<readonly [value: A, weight: number]>
}

export interface FeatureFlagDefinitionInput<A extends string> {
  readonly key: string
  readonly allocationVersion: number
  readonly assignmentUnit: "installation"
  readonly default: A
  readonly variants: ReadonlyArray<readonly [value: A, weight: number]>
}

export interface FeatureFlagDecision<A extends string> {
  readonly key: string
  readonly value: A
  readonly allocationVersion: number
  readonly source: "allocation" | "default" | "dev-override"
}

export interface FeatureFlagBootstrap {
  readonly subjectId: string | null
}

/** Validates and canonicalizes the public installation UUID. */
export const makeFeatureFlagSubjectId = (value: string): FeatureFlagSubjectId =>
  Schema.decodeUnknownSync(FeatureFlagSubjectId)(value.toLowerCase())

export const parseFeatureFlagSubjectId = (
  value: string | null | undefined,
// SAFETY: Runtime representation is checked at this boundary before use.
): FeatureFlagSubjectId | null => typeof value === "string"
  ? Option.getOrNull(
      Schema.decodeUnknownOption(FeatureFlagSubjectId)(value.toLowerCase()),
    )
  : null

/** Builds an immutable, validated definition; evaluators only accept this branded result. */
export const defineFeatureFlag = <const A extends string>(
  definition: FeatureFlagDefinitionInput<A>,
): FeatureFlagDefinition<A> => {
  // Restricting keys and subjects to canonical grammars makes the documented
  // colon-delimited hash input unambiguous.
  if (!FEATURE_FLAG_KEY.test(definition.key)) {
    throw new TypeError("feature flag key must use canonical dot-separated lowercase segments")
  }
  if (!Number.isSafeInteger(definition.allocationVersion) || definition.allocationVersion < 1) {
    throw new TypeError("feature flag allocationVersion must be a positive safe integer")
  }

  const values = new Set<string>()
  let total = 0
  const variants = definition.variants.map(([value, weight]) => {
    if (value.length === 0 || values.has(value)) {
      throw new TypeError(`duplicate or empty feature flag variant: ${value}`)
    }
    if (!Number.isInteger(weight) || weight <= 0 || weight > 10_000) {
      throw new TypeError(`invalid feature flag weight for variant: ${value}`)
    }
    values.add(value)
    total += weight
    return Object.freeze([value, weight] as const)
  })
  if (total !== 10_000) {
    throw new TypeError("feature flag weights must sum to 10000")
  }
  if (!values.has(definition.default)) {
    throw new TypeError("feature flag default must be one of its variants")
  }

  return Object.freeze({
    [featureFlagDefinitionTypeId]: true as const,
    key: definition.key,
    allocationVersion: definition.allocationVersion,
    assignmentUnit: definition.assignmentUnit,
    default: definition.default,
    variants: Object.freeze(variants),
  })
}
