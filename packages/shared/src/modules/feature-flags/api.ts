import { Schema } from "effect"
import {
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi"

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

const featureFlagConfigurations = Schema.Array(FeatureFlagConfiguration).pipe(
  Schema.check(validConfigurations),
)

/** Revision zero exists only as the synthetic response for an empty repository. */
export const SyntheticEmptyFeatureFlagSnapshot = Schema.Struct({
  configurationRevision: Schema.Literal(0),
  flags: Schema.Tuple([]),
}).annotate({ identifier: "SyntheticEmptyFeatureFlagSnapshot" })
export type SyntheticEmptyFeatureFlagSnapshot =
  typeof SyntheticEmptyFeatureFlagSnapshot.Type

/** A snapshot eligible for publication and persistence. */
export const PublishedFeatureFlagSnapshot = Schema.Struct({
  configurationRevision: Schema.Int.pipe(
    Schema.check(
      Schema.isBetween({
        minimum: 1,
        maximum: MaximumConfigurationRevision,
      }),
    ),
  ),
  flags: featureFlagConfigurations,
}).annotate({ identifier: "PublishedFeatureFlagSnapshot" })
export type PublishedFeatureFlagSnapshot =
  typeof PublishedFeatureFlagSnapshot.Type

/** One immutable public snapshot: synthetic revision zero or a published revision. */
export const FeatureFlagSnapshot = Schema.Union([
  SyntheticEmptyFeatureFlagSnapshot,
  PublishedFeatureFlagSnapshot,
]).annotate({ identifier: "FeatureFlagSnapshot" })
export type FeatureFlagSnapshot = typeof FeatureFlagSnapshot.Type

const conditionalResponseHeaders = {
  ETag: {
    description: "Strong validator derived from the active configuration revision.",
    required: true,
    schema: { type: "string" },
  },
  "Cache-Control": {
    description: "Public snapshot revalidation policy.",
    required: true,
    schema: { type: "string" },
  },
}

const getActiveSnapshot = HttpApiEndpoint.get(
  "getActiveSnapshot",
  "/feature-flags/snapshot",
  {
    headers: {
      "if-none-match": Schema.optional(Schema.String),
    },
    success: [
      FeatureFlagSnapshot,
      HttpApiSchema.Empty(304),
    ],
    error: HttpApiError.InternalServerErrorNoContent,
  },
).annotate(OpenApi.Transform, (operation) => {
  const responses = operation.responses
  for (const status of ["200", "304"] as const) {
    const response = responses?.[status]
    if (response !== undefined) {
      responses[status] = {
        ...response,
        headers: {
          ...response.headers,
          ...conditionalResponseHeaders,
        },
      }
    }
  }
  return operation
})

export class PublicFeatureFlagsApi extends HttpApiGroup.make(
  "featureFlags",
  { topLevel: true },
).add(getActiveSnapshot) {}
