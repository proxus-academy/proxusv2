import type {
  AgreementTerms,
  CreatorEffectiveStatus,
  UgcCampaign,
  UgcGroup,
  UgcGroupMember,
  UgcMeet,
  UgcUser,
  UgcProgramConfigurationData,
  CampaignTier,
} from "@proxus/shared/ugc-management"

const isBefore = (left: string, right: string) => Date.parse(left) < Date.parse(right)
const isAtOrAfter = (left: string, right: string) => Date.parse(left) >= Date.parse(right)

export const campaignsOverlap = (left: UgcCampaign, right: UgcCampaign) =>
  isBefore(left.startsAt, right.submissionsCloseAt) && isBefore(right.startsAt, left.submissionsCloseAt)

export const managerCanHandleCreator = (manager: UgcUser, creator: UgcUser) =>
  manager.userType === "manager" &&
  manager.status === "active" &&
  manager.data._tag === "ManagerData" &&
  manager.data.markets.includes(creator.countryCode)

export const managerOwnsGroup = (manager: UgcUser, group: UgcGroup) => manager.id === group.managerId

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]))
  return value
}

const canonicalTerms = (terms: AgreementTerms) => ({
  ...terms,
  formats: [...terms.formats].sort(),
  requiredPlatforms: [...terms.requiredPlatforms].sort(),
  bonusRules: [...terms.bonusRules].sort((left, right) => JSON.stringify(stable(left)).localeCompare(JSON.stringify(stable(right)))),
})

export const termsSnapshotKey = (terms: AgreementTerms) => JSON.stringify(stable(canonicalTerms(terms)))
export const agreementTermsKey = (terms: AgreementTerms) => {
  const { maxVideosPerDay: _maxVideosPerDay, minVideosPerWeek: _minVideosPerWeek, ...materialTerms } = canonicalTerms(terms)
  return JSON.stringify(stable(materialTerms))
}

export const defaultProgramConfigurationData = (market: string): UgcProgramConfigurationData => ({
  trial: {
    durationDays: 14,
    warmingDays: 2,
    requiredVideoCount: 8,
    maxVideosPerDay: 2,
    minVideosPerWeek: market === "ES" ? 1 : 3,
    formats: ["testimonial", "review", "routine"],
    requiredPlatforms: ["tiktok", "instagram"],
    completionCompensationCents: market === "ES" ? 7_200 : 5_600,
    currency: market === "ES" ? "EUR" : "USD",
  },
  contractPolicy: {
    contentRetentionMonths: 3,
    creatorNoticeDays: 5,
    paidMediaRightsAmountCents: 3_000,
    paidMediaRightsDurationMonths: 3,
    exclusivityRequired: true,
  },
  managerIncentives: {
    fixedPercentBasisPoints: 500,
    viewsBonusPercentBasisPoints: 500,
    rankingBonusPercentBasisPoints: 500,
    referralBonusPercentBasisPoints: 0,
    manualAdjustmentPercentBasisPoints: 0,
    outboundTrialPassBonusCents: market === "ES" ? 2_000 : 1_500,
  },
  historyRetentionDays: 90,
})

export const trialAgreementTerms = (configuration: UgcProgramConfigurationData): AgreementTerms => ({
  contentTarget: configuration.trial.requiredVideoCount,
  compensationCents: configuration.trial.completionCompensationCents,
  currency: configuration.trial.currency,
  formats: configuration.trial.formats,
  requiredPlatforms: configuration.trial.requiredPlatforms,
  bonusRules: [],
  maxVideosPerDay: configuration.trial.maxVideosPerDay,
  minVideosPerWeek: configuration.trial.minVideosPerWeek,
  contractPolicy: configuration.contractPolicy,
})

export const campaignAgreementTerms = (campaign: UgcCampaign, tier: CampaignTier): AgreementTerms => ({
  contentTarget: tier.videoTarget,
  compensationCents: tier.fixedAmountCents,
  currency: campaign.data.currency,
  formats: campaign.data.formats,
  requiredPlatforms: campaign.data.requiredPlatforms,
  bonusRules: campaign.data.bonusRules,
  maxVideosPerDay: null,
  minVideosPerWeek: null,
  contractPolicy: campaign.data.contractPolicy,
})

export const deriveCreatorEffectiveStatus = (input: {
  readonly creator: UgcUser
  readonly now: string
  readonly campaigns: ReadonlyArray<UgcCampaign>
  readonly groups: ReadonlyArray<UgcGroup>
  readonly memberships: ReadonlyArray<UgcGroupMember>
  readonly meets: ReadonlyArray<UgcMeet>
}): CreatorEffectiveStatus => {
  const { creator, now } = input
  if (creator.status === "lead") return "lead"
  if (creator.status === "applicant") return "application_pending"
  if (creator.status === "suspended" || creator.status === "rejected" || creator.status === "disqualified" || creator.status === "exited") return creator.status
  if (creator.status === "onboarding") {
    const data = creator.data._tag === "OnboardingData" ? creator.data : undefined
    if (data?.requirements.some((item) => (item.id === "profile" || item.id === "training") && item.completedAt === null) === true) return "requirements_pending"
    const attended = input.meets.some((meet) => meet.creatorId === creator.id && meet.status === "attended")
    if (attended) return "trial_preparation"
    const reserved = input.meets.find((meet) => meet.creatorId === creator.id && meet.status === "reserved")
    return reserved === undefined ? "meeting_pending" : "meeting_scheduled"
  }
  if (creator.status === "trial" && creator.data._tag === "TrialData") {
    if (isBefore(now, creator.data.publishingStartsAt)) return "trial_warming"
    if (isBefore(now, creator.data.publishingEndsAt)) return "trial_publishing"
    return "trial_review"
  }
  if (creator.status === "creator") {
    const activeMemberships = input.memberships.filter((membership) => membership.creatorId === creator.id && membership.status !== "removed")
    const assignedCampaigns = activeMemberships.flatMap((membership) => {
      const group = input.groups.find((candidate) => candidate.id === membership.groupId)
      const campaign = group === undefined ? undefined : input.campaigns.find((candidate) => candidate.id === group.campaignId)
      return campaign === undefined ? [] : [campaign]
    })
    const campaign = assignedCampaigns.find((candidate) => isBefore(now, candidate.reconciliationEndsAt) && isAtOrAfter(now, candidate.startsAt))
      ?? assignedCampaigns.find((candidate) => isBefore(now, candidate.startsAt))
    if (campaign === undefined) return "waiting_campaign"
    if (isBefore(now, campaign.startsAt)) return "campaign_scheduled"
    if (isBefore(now, campaign.submissionsCloseAt)) return "campaign_active"
    return "campaign_reconciliation"
  }
  return "application_pending"
}
