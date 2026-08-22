import type {
  CreatorEffectiveStatus,
  UgcCampaign,
  UgcGroup,
  UgcGroupMember,
  UgcMeet,
  UgcUser,
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
    if (data?.requirements.some((item) => item.completedAt === null) === true) return "requirements_pending"
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
