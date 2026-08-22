import type { UgcProgramConfigurationData } from "@proxus/shared/ugc-management"

const amountCents = (data: FormData, name: string) => Math.round(Number(data.get(name)) * 100)
const basisPoints = (data: FormData, name: string) => Math.round(Number(data.get(name)) * 100)

export const programConfigurationFromFormData = (data: FormData): UgcProgramConfigurationData => ({
  trial: {
    durationDays: Number(data.get("durationDays")), warmingDays: Number(data.get("warmingDays")), requiredVideoCount: Number(data.get("requiredVideoCount")),
    maxVideosPerDay: Number(data.get("maxVideosPerDay")), minVideosPerWeek: Number(data.get("minVideosPerWeek")),
    formats: String(data.get("formats")).split(",").map((item) => item.trim()).filter(Boolean), requiredPlatforms: ["tiktok", "instagram"],
    completionCompensationCents: amountCents(data, "trialCompensation"), currency: String(data.get("currency")) === "USD" ? "USD" : "EUR",
  },
  contractPolicy: {
    contentRetentionMonths: Number(data.get("contentRetentionMonths")), creatorNoticeDays: Number(data.get("creatorNoticeDays")),
    paidMediaRightsAmountCents: amountCents(data, "paidMediaRightsAmount"), paidMediaRightsDurationMonths: Number(data.get("paidMediaRightsDurationMonths")),
    exclusivityRequired: data.get("exclusivityRequired") === "on",
  },
  managerIncentives: {
    fixedPercentBasisPoints: basisPoints(data, "fixedPercent"), viewsBonusPercentBasisPoints: basisPoints(data, "viewsPercent"),
    rankingBonusPercentBasisPoints: basisPoints(data, "rankingPercent"), referralBonusPercentBasisPoints: basisPoints(data, "referralPercent"),
    manualAdjustmentPercentBasisPoints: basisPoints(data, "adjustmentPercent"), outboundTrialPassBonusCents: amountCents(data, "outboundTrialPassBonus"),
  },
  historyRetentionDays: Number(data.get("historyRetentionDays")),
})
