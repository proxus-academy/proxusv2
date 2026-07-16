import { Schema } from "effect"

const EventBase = {
  occurredAt: Schema.optional(Schema.DateTimeUtcFromString),
} as const

export class FeatureFlagExposed extends Schema.Class<FeatureFlagExposed>("FeatureFlagExposed")({
  _tag: Schema.Literal("feature_flag_exposed"),
  ...EventBase,
  flagKey: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(100))),
  configurationRevision: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 }))),
  allocationVersion: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 }))),
  reportedVariant: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
}) {}

export class RegistrationCtaClicked extends Schema.Class<RegistrationCtaClicked>("RegistrationCtaClicked")({
  _tag: Schema.Literal("registration_cta_clicked"),
  ...EventBase,
  flagKey: Schema.Literal("registration.cta"),
  configurationRevision: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 }))),
  allocationVersion: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 }))),
  reportedVariant: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
}) {}

export class RegistrationCompleted extends Schema.Class<RegistrationCompleted>("RegistrationCompleted")({
  _tag: Schema.Literal("registration_completed"),
  ...EventBase,
  source: Schema.Literals(["registration_cta", "direct"]),
}) {}

/** Events accepted from an untrusted browser request. */
export const PublicProductAnalyticsEvent = Schema.Union([
  FeatureFlagExposed,
  RegistrationCtaClicked,
])
export type PublicProductAnalyticsEvent = typeof PublicProductAnalyticsEvent.Type

/** Full domain union. Registration completion is emitted only by trusted server code. */
export const ProductAnalyticsEvent = Schema.Union([
  PublicProductAnalyticsEvent,
  RegistrationCompleted,
])
export type ProductAnalyticsEvent = typeof ProductAnalyticsEvent.Type
