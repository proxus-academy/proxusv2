import { Schema } from "effect"
import { MaximumConfigurationRevision } from "../feature-flags/api.js"

const EventBase = { occurredAt: Schema.optional(Schema.DateTimeUtcFromString) } as const
/** Immutable decision coordinates copied onto every row used for flag analysis. */
const AssignmentContext = {
  flagKey: Schema.Literal("registration.landing"),
  revision: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: MaximumConfigurationRevision }))),
  variant: Schema.Literals(["short", "long"]),
} as const

export class FeatureFlagExposed extends Schema.TaggedClass<FeatureFlagExposed>()(
  "feature_flag_exposed",
  { ...EventBase, ...AssignmentContext },
) {}
export class RegistrationStarted extends Schema.TaggedClass<RegistrationStarted>()(
  "registration_started",
  { ...EventBase, ...AssignmentContext },
) {}
/**
 * Browser-observed completion of the current registration UI flow. This is a
 * non-authoritative analytics signal, not evidence that backend registration succeeded.
 */
export class RegistrationCompleted extends Schema.TaggedClass<RegistrationCompleted>()(
  "registration_completed",
  { ...EventBase, ...AssignmentContext },
) {}

const RegistrationStepContext = {
  step: Schema.NonEmptyString,
  stepIndex: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  totalSteps: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  provider: Schema.Literals(["email", "google"]),
} as const

export class RegistrationStepViewed extends Schema.TaggedClass<RegistrationStepViewed>()(
  "registration_step_viewed",
  { ...EventBase, ...AssignmentContext, ...RegistrationStepContext },
) {}

export class RegistrationStepCompleted extends Schema.TaggedClass<RegistrationStepCompleted>()(
  "registration_step_completed",
  { ...EventBase, ...AssignmentContext, ...RegistrationStepContext },
) {}

/** Events accepted from an untrusted browser. Identity and consent are transport context. */
export const PublicProductAnalyticsEvent = Schema.Union([
  FeatureFlagExposed,
  RegistrationStarted,
  RegistrationCompleted,
  RegistrationStepViewed,
  RegistrationStepCompleted,
])
export type PublicProductAnalyticsEvent = typeof PublicProductAnalyticsEvent.Type
