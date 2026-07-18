import { defineFeatureFlag } from "./model.js"

export const RegistrationCta = defineFeatureFlag({
  key: "registration.cta",
  allocationVersion: 1,
  assignmentUnit: "installation",
  default: "control",
  variants: [
    ["control", 5_000],
    ["benefitCopy", 5_000],
  ],
} as const)

export type RegistrationCtaVariant =
  (typeof RegistrationCta.variants)[number][0]
