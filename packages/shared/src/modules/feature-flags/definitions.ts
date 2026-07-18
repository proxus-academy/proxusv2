import { defineFeatureFlag } from "./model.js"

export const RegistrationLanding = defineFeatureFlag({
  key: "registration.landing",
  allocationVersion: 1,
  assignmentUnit: "installation",
  default: "short",
  variants: [
    ["short", 5_000],
    ["long", 5_000],
  ],
} as const)

/** @deprecated use RegistrationLanding. */
export const RegistrationCta = RegistrationLanding
export type RegistrationLandingVariant = (typeof RegistrationLanding.variants)[number][0]
export type RegistrationCtaVariant = RegistrationLandingVariant
