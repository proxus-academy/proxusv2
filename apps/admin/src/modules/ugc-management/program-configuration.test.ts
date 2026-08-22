import { describe, expect, test } from "vitest"
import { programConfigurationFromFormData } from "./program-configuration.js"

describe("programConfigurationFromFormData", () => {
  test("converts monetary and percentage inputs into immutable policy units", () => {
    const data = new FormData()
    for (const [key, value] of Object.entries({ durationDays: "14", warmingDays: "2", requiredVideoCount: "8", maxVideosPerDay: "2", minVideosPerWeek: "1", formats: "testimonial, review", trialCompensation: "72.50", currency: "EUR", contentRetentionMonths: "3", creatorNoticeDays: "5", paidMediaRightsAmount: "30", paidMediaRightsDurationMonths: "3", fixedPercent: "5.25", viewsPercent: "4", rankingPercent: "3", referralPercent: "2", adjustmentPercent: "0", outboundTrialPassBonus: "20", historyRetentionDays: "90" })) data.set(key, value)
    data.set("exclusivityRequired", "on")

    expect(programConfigurationFromFormData(data)).toMatchObject({
      trial: { completionCompensationCents: 7_250, formats: ["testimonial", "review"], requiredPlatforms: ["tiktok", "instagram"] },
      managerIncentives: { fixedPercentBasisPoints: 525, viewsBonusPercentBasisPoints: 400, outboundTrialPassBonusCents: 2_000 },
      contractPolicy: { paidMediaRightsAmountCents: 3_000, exclusivityRequired: true },
      historyRetentionDays: 90,
    })
  })
})
