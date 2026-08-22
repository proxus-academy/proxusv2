import { UgcWorkspace, type UgcUser } from "@proxus/shared/ugc-management"
import type { UgcMemoryState } from "./repository.js"

const uniqueUsers = (users: ReadonlyArray<UgcUser>) => [...new Map(users.map((user) => [user.id, user])).values()]

export const scopeWorkspace = (
  state: UgcMemoryState,
  currentUser: UgcUser | null,
  admin: boolean,
  asOf: string,
) => {
  if (admin) return new UgcWorkspace({ asOf, role: "admin", currentUser, ...state })
  if (currentUser === null) {
    return new UgcWorkspace({ asOf, role: "none", currentUser: null, ...state, users: [], campaigns: [], groups: [], memberships: [], meets: [], videos: [], videoData: [], payments: [], programConfigurations: [] })
  }
  if (currentUser.userType === "manager") {
    const groups = state.groups.filter((group) => group.managerId === currentUser.id)
    const groupIds = new Set(groups.map((group) => group.id))
    const memberships = state.memberships.filter((membership) => groupIds.has(membership.groupId))
    const creatorIds = new Set(memberships.map((membership) => membership.creatorId))
    for (const meet of state.meets) if (meet.managerId === currentUser.id && meet.creatorId !== null) creatorIds.add(meet.creatorId)
    const users = uniqueUsers([currentUser, ...state.users.filter((user) => creatorIds.has(user.id) || (
      user.userType === "creator" && currentUser.data._tag === "ManagerData" && currentUser.data.markets.includes(user.countryCode) && (
        user.status === "applicant" ||
        (user.status === "lead" && user.data._tag === "LeadData" && user.data.createdByManagerId === currentUser.id) ||
        (user.status === "onboarding" && user.data._tag === "OnboardingData" && user.data.acceptedBy === currentUser.id) ||
        (user.data._tag === "TerminalData" && user.data.decidedBy === currentUser.id)
      )
    ))])
    const campaignIds = new Set(groups.map((group) => group.campaignId))
    const videos = state.videos.filter((video) => creatorIds.has(video.creatorId))
    const videoIds = new Set(videos.map((video) => video.id))
    return new UgcWorkspace({
      asOf,
      role: "manager",
      currentUser,
      users,
      campaigns: state.campaigns.filter((campaign) => campaignIds.has(campaign.id)),
      groups,
      memberships,
      meets: state.meets.filter((meet) => meet.managerId === currentUser.id),
      videos,
      videoData: state.videoData.filter((item) => videoIds.has(item.videoId)),
      payments: state.payments.filter((payment) => payment.recipientUserId === currentUser.id || (payment.relatedCreatorId !== null && creatorIds.has(payment.relatedCreatorId))),
      programConfigurations: state.programConfigurations.filter((configuration) => currentUser.data._tag === "ManagerData" && currentUser.data.markets.includes(configuration.market)),
    })
  }
  const memberships = state.memberships.filter((membership) => membership.creatorId === currentUser.id)
  const groupIds = new Set(memberships.map((membership) => membership.groupId))
  const groups = state.groups.filter((group) => groupIds.has(group.id))
  const campaignIds = new Set(groups.map((group) => group.campaignId))
  const managerIds = new Set(groups.map((group) => group.managerId))
  const compatibleManagers = state.users.filter((user) => user.userType === "manager" && user.status === "active" && user.data._tag === "ManagerData" && user.data.markets.includes(currentUser.countryCode))
  const users = uniqueUsers([currentUser, ...state.users.filter((user) => managerIds.has(user.id)), ...compatibleManagers])
  const videos = state.videos.filter((video) => video.creatorId === currentUser.id)
  const videoIds = new Set(videos.map((video) => video.id))
  return new UgcWorkspace({
    asOf,
    role: "creator",
    currentUser,
    users,
    campaigns: state.campaigns.filter((campaign) => campaignIds.has(campaign.id)),
    groups,
    memberships,
    meets: state.meets.filter((meet) => meet.creatorId === currentUser.id || (meet.creatorId === null && compatibleManagers.some((manager) => manager.id === meet.managerId))),
    videos,
    videoData: state.videoData.filter((item) => videoIds.has(item.videoId)),
    payments: state.payments.filter((payment) => payment.recipientUserId === currentUser.id),
    programConfigurations: [],
  })
}
