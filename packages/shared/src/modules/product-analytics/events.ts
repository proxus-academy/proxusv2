import { Schema } from "effect"
import { MaximumConfigurationRevision } from "../feature-flags/api.js"

const bounded = Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(100)))
const EventBase = { occurredAt: Schema.optional(Schema.DateTimeUtcFromString) } as const
/** Immutable decision coordinates copied onto every row used for flag analysis. */
const AssignmentContext = {
  flagKey: Schema.Literal("registration.landing"),
  revision: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MaximumConfigurationRevision }))),
  variant: Schema.Literals(["short", "long"]),
} as const

export class FeatureFlagExposed extends Schema.Class<FeatureFlagExposed>("FeatureFlagExposed")({
  _tag: Schema.Literal("feature_flag_exposed"), ...EventBase, ...AssignmentContext,
}) {}
export class RegistrationStarted extends Schema.Class<RegistrationStarted>("RegistrationStarted")({
  _tag: Schema.Literal("registration_started"), ...EventBase, ...AssignmentContext,
}) {}
export class RegistrationCompleted extends Schema.Class<RegistrationCompleted>("RegistrationCompleted")({
  _tag: Schema.Literal("registration_completed"), ...EventBase, ...AssignmentContext,
}) {}

/** Events accepted from an untrusted browser. Identity and consent are transport context. */
export const PublicProductAnalyticsEvent = Schema.Union([
  FeatureFlagExposed, RegistrationStarted, RegistrationCompleted,
])
export type PublicProductAnalyticsEvent = typeof PublicProductAnalyticsEvent.Type
export const ProductAnalyticsEvent = PublicProductAnalyticsEvent
export type ProductAnalyticsEvent = typeof ProductAnalyticsEvent.Type

// Kept as a private-schema building block for future non-flag events.
export const ProductAnalyticsBoundedString = bounded
