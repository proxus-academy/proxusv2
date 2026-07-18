import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const MaximumConfigurationRevision = 9_007_199_254_740_991
const keyPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/
const canonicalKey = Schema.makeFilter<string>((value) => keyPattern.test(value) ? undefined : "must be a canonical feature flag key")
const nonEmptyBoundedString = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64)))
const positiveSafeInteger = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })))
const weight = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 10_000 })))

export class FeatureFlagVariant extends Schema.Class<FeatureFlagVariant>("FeatureFlagVariant")({
  value: nonEmptyBoundedString,
  weight,
}) {}

export class FeatureFlagConfiguration extends Schema.Class<FeatureFlagConfiguration>("FeatureFlagConfiguration")({
  key: Schema.String.pipe(Schema.check(canonicalKey), Schema.check(Schema.isMaxLength(100))),
  /** Disabled flags always resolve to their locally known default variant. */
  enabled: Schema.Boolean,
  allocationVersion: positiveSafeInteger,
  default: nonEmptyBoundedString,
  variants: Schema.Array(FeatureFlagVariant).pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.makeFilter((variants) => {
      const values = new Set(variants.map(({ value }) => value))
      return values.size === variants.length ? undefined : "variant values must be unique"
    })),
    Schema.check(Schema.makeFilter((variants) => variants.reduce((sum, variant) => sum + variant.weight, 0) === 10_000
      ? undefined : "variant weights must sum to 10000")),
  ),
}) {}

const validConfigurations = Schema.makeFilter<ReadonlyArray<FeatureFlagConfiguration>>((flags) => {
  const keys = new Set(flags.map(({ key }) => key))
  if (keys.size !== flags.length) return "feature flag keys must be unique"
  return flags.every((flag) => flag.variants.some(({ value }) => value === flag.default))
    ? undefined : "each default must identify a configured variant"
})

/** One immutable, atomically activated public configuration snapshot. */
export class FeatureFlagSnapshot extends Schema.Class<FeatureFlagSnapshot>("FeatureFlagSnapshot")({
  configurationRevision: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MaximumConfigurationRevision }))),
  flags: Schema.Array(FeatureFlagConfiguration).pipe(Schema.check(validConfigurations)),
}) {}

export class PublicFeatureFlagsApi extends HttpApiGroup.make("featureFlags", { topLevel: true }).add(
  HttpApiEndpoint.get("getActiveSnapshot", "/feature-flags/snapshot", {
    success: FeatureFlagSnapshot,
  }),
) {}
