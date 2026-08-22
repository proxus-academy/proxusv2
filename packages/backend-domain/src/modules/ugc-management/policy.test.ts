import type { AgreementTerms } from "@proxus/shared/ugc-management"
import { describe, expect, test } from "vitest"
import { agreementTermsKey, termsSnapshotKey } from "./policy.js"

const terms: AgreementTerms = {
  contentTarget: 8,
  compensationCents: 7_200,
  currency: "EUR",
  formats: ["testimonial", "review"],
  requiredPlatforms: ["tiktok", "instagram"],
  bonusRules: [
    { _tag: "views", threshold: 10_000, amountCents: 1_000 },
    { _tag: "topN", positions: 3, amountCents: 2_000 },
  ],
  maxVideosPerDay: 2,
  minVideosPerWeek: 3,
  contractPolicy: {
    contentRetentionMonths: 3,
    creatorNoticeDays: 5,
    paidMediaRightsAmountCents: 3_000,
    paidMediaRightsDurationMonths: 3,
    exclusivityRequired: true,
  },
}

describe("UGC agreement policy", () => {
  test("treats differently ordered terms as the same agreement", () => {
    const reordered: AgreementTerms = {
      ...terms,
      formats: [...terms.formats].reverse(),
      requiredPlatforms: [...terms.requiredPlatforms].reverse(),
      bonusRules: [...terms.bonusRules].reverse(),
    }

    expect(termsSnapshotKey(reordered)).toBe(termsSnapshotKey(terms))
    expect(agreementTermsKey(reordered)).toBe(agreementTermsKey(terms))
  })

  test("allows operational cadence to change without requiring a new signature", () => {
    expect(agreementTermsKey({ ...terms, maxVideosPerDay: 3, minVideosPerWeek: 4 })).toBe(agreementTermsKey(terms))
    expect(termsSnapshotKey({ ...terms, maxVideosPerDay: 3 })).not.toBe(termsSnapshotKey(terms))
  })
})
