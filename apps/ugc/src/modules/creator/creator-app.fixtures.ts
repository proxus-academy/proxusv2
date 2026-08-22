import {
  UgcCampaign,
  UgcGroup,
  UgcGroupMember,
  UgcMeet,
  UgcPayment,
  UgcUser,
  UgcVideo,
  UgcVideoData,
  UgcWorkspace,
  makeUgcCampaignId,
  makeUgcGroupId,
  makeUgcGroupMemberId,
  makeUgcMeetId,
  makeUgcPaymentId,
  makeUgcUserId,
  makeUgcVideoDataId,
  makeUgcVideoId,
  type ContractSnapshot,
  type UgcUserData,
  type UgcUserStatus,
} from "@proxus/shared/ugc-management"

export type CreatorAppScenario =
  | "application"
  | "applicationPending"
  | "applicationRejected"
  | "onboarding"
  | "contractReady"
  | "meetingPending"
  | "meetingScheduled"
  | "trialWarming"
  | "trialPublishing"
  | "trialReview"
  | "disqualified"
  | "waitingCampaign"
  | "campaignScheduled"
  | "campaignActive"
  | "campaignReview"
  | "suspended"
  | "exited"
  | "videos"
  | "payments"
  | "profile"

export const creatorAppScenarioLabels = {
  application: "Registro de contacto",
  applicationPending: "Solicitud pendiente",
  applicationRejected: "Solicitud rechazada",
  onboarding: "Checklist de onboarding",
  contractReady: "Contrato listo para firmar",
  meetingPending: "Reserva de reunión",
  meetingScheduled: "Reunión reservada",
  trialWarming: "Calentamiento",
  trialPublishing: "Trial activo",
  trialReview: "Trial en revisión",
  disqualified: "Trial no superado",
  waitingCampaign: "Esperando campaña",
  campaignScheduled: "Campaña programada",
  campaignActive: "Campaña activa",
  campaignReview: "Campaña en revisión",
  suspended: "Cuenta suspendida",
  exited: "Cuenta cerrada",
  videos: "Historial de vídeos",
  payments: "Pagos",
  profile: "Perfil",
} satisfies Record<CreatorAppScenario, string>

const asOf = "2026-08-22T12:00:00.000Z"
const creatorId = makeUgcUserId("71000000-0000-4000-8000-000000000001")
const managerId = makeUgcUserId("71000000-0000-4000-8000-000000000002")
const campaignId = makeUgcCampaignId("71000000-0000-4000-8000-000000000003")
const previousCampaignId = makeUgcCampaignId("71000000-0000-4000-8000-000000000004")
const groupId = makeUgcGroupId("71000000-0000-4000-8000-000000000005")
const membershipId = makeUgcGroupMemberId("71000000-0000-4000-8000-000000000006")

const profile = {
  tiktokHandle: "@luciaromero",
  instagramHandle: "@luciaromero",
  phone: "+34 612 345 678",
} as const

const contractPolicy = { contentRetentionMonths: 3, creatorNoticeDays: 5, paidMediaRightsAmountCents: 3_000, paidMediaRightsDurationMonths: 3, exclusivityRequired: true } as const
const managerIncentives = { fixedPercentBasisPoints: 500, viewsBonusPercentBasisPoints: 500, rankingBonusPercentBasisPoints: 500, referralBonusPercentBasisPoints: 0, manualAdjustmentPercentBasisPoints: 0, outboundTrialPassBonusCents: 2_000 } as const
const trialTerms = { contentTarget: 8, compensationCents: 7_200, currency: "EUR", formats: ["testimonial", "review", "routine"], requiredPlatforms: ["tiktok", "instagram"], bonusRules: [], maxVideosPerDay: 2, minVideosPerWeek: 1, contractPolicy } as const

const contract: ContractSnapshot = {
  generatedAt: "2026-08-18T10:00:00.000Z",
  signedAt: "2026-08-19T10:00:00.000Z",
  scope: "trial" as const,
  campaignId: null,
  termsKey: "trial-es-v1",
  terms: trialTerms,
  locale: "es-ES" as const,
  documentType: "DNI" as const,
  documentNumber: "00000000T",
  address: "Calle Mayor 1, Madrid",
  paymentMethod: "grade" as const,
  renderedDocument: "Acuerdo de colaboración UGC entre Proxus y Lucía Romero.",
}

const creatorData = {
  _tag: "CreatorData" as const,
  approvedAt: "2026-08-10T10:00:00.000Z",
  tierId: "tier-2",
  profile,
  contracts: [contract],
  acquisition: { source: "inbound" as const, outboundManagerId: null },
}

const user = (status: UgcUserStatus, data: UgcUserData) => new UgcUser({
  id: creatorId,
  authUserId: null,
  userType: "creator",
  status,
  displayName: "Lucía Romero",
  email: "lucia@proxus.test",
  countryCode: "ES",
  data,
  version: 1,
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: asOf,
})

const campaign = (
  id: typeof campaignId,
  name: string,
  status: "published" | "finalized",
  startsAt: string,
  submissionsCloseAt: string,
  reconciliationEndsAt: string,
) => new UgcCampaign({
  id,
  name,
  status,
  startsAt,
  submissionsCloseAt,
  reconciliationEndsAt,
  data: {
    countries: ["ES"],
    formats: ["testimonial", "review", "routine"],
    tiers: [{ id: "tier-2", label: "Tier 2", videoTarget: 8, fixedAmountCents: 24_000 }],
    bonusRules: [{ _tag: "views", threshold: 10_000, amountCents: 5_000 }],
    currency: "EUR",
    contractPolicy,
    requiredPlatforms: ["tiktok", "instagram"],
    managerIncentives,
  },
  version: 1,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: asOf,
})

const group = (targetCampaignId: typeof campaignId | typeof previousCampaignId) => new UgcGroup({
  id: groupId,
  campaignId: targetCampaignId,
  managerId,
  name: "Equipo Violeta",
  status: "active",
  capacity: 25,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: asOf,
})

const membership = new UgcGroupMember({
  id: membershipId,
  groupId,
  creatorId,
  tierId: "tier-2",
  status: "active",
  agreementTermsKey: "campaign-tier-2-v1",
  joinedAt: "2026-08-12T10:00:00.000Z",
  completedAt: null,
})

const video = (
  suffix: string,
  reference: string,
  status: "submitted" | "changes_requested" | "accepted",
  submittedAt: string,
) => new UgcVideo({
  id: makeUgcVideoId(`71000000-0000-4000-8000-0000000000${suffix}`),
  creatorId,
  campaignId: previousCampaignId,
  status,
  format: "review",
  reference,
  tiktokUrl: `https://www.tiktok.com/@luciaromero/video/${suffix}`,
  instagramUrl: `https://www.instagram.com/reel/proxus-${suffix}`,
  submittedAt,
  reviewedAt: status === "submitted" ? null : "2026-08-21T10:00:00.000Z",
  reviewNotes: status === "changes_requested" ? "Ajusta el primer plano del producto." : null,
  createdAt: submittedAt,
  updatedAt: asOf,
})

const videos = [
  video("11", "Mi rutina de noche", "submitted", "2026-08-20T10:00:00.000Z"),
  video("12", "Resultados después de 7 días", "accepted", "2026-08-19T10:00:00.000Z"),
  video("13", "Tres cosas que me sorprendieron", "changes_requested", "2026-08-18T10:00:00.000Z"),
]

const videoData = videos.map((item, index) => new UgcVideoData({
  id: makeUgcVideoDataId(`71000000-0000-4000-8000-0000000000${index + 21}`),
  videoId: item.id,
  tiktokViews: [18_400, 42_100, 9_800][index] ?? 0,
  instagramViews: [5_600, 10_700, 2_700][index] ?? 0,
  capturedAt: asOf,
  source: "mock",
}))

const baseWorkspace = (currentUser: UgcUser | null, extra: Partial<UgcWorkspace> = {}) => new UgcWorkspace({
  asOf,
  role: currentUser === null ? "none" : "creator",
  currentUser,
  users: currentUser === null ? [] : [currentUser],
  campaigns: [],
  groups: [],
  memberships: [],
  meets: [],
  videos: [],
  videoData: [],
  payments: [],
  programConfigurations: [],
  ...extra,
})

const onboarding = (
  requirements: ReadonlyArray<{ readonly id: string; readonly label: string; readonly completedAt: string | null }>,
  snapshot: typeof contract | null,
) => user("onboarding", {
  _tag: "OnboardingData",
  acceptedAt: "2026-08-17T10:00:00.000Z",
  acceptedBy: managerId,
  profile,
  requirements,
  missedMeetCount: 0,
  contract: snapshot,
  acquisition: { source: "inbound", outboundManagerId: null },
})

const incompleteRequirements = [
  { id: "profile", label: "Completar perfil", completedAt: asOf },
  { id: "training", label: "Conocer cómo funciona Proxus", completedAt: null },
  { id: "contract", label: "Firmar contrato", completedAt: null },
  { id: "social", label: "Registrar cuenta social", completedAt: null },
]

const preMeetRequirements = incompleteRequirements.map((requirement) => requirement.id === "training" ? { ...requirement, completedAt: asOf } : requirement)

const terminal = (status: "rejected" | "disqualified" | "suspended" | "exited", reason: string) => user(status, {
  _tag: "TerminalData",
  reason,
  decidedAt: asOf,
  decidedBy: managerId,
  previousStatus: status === "rejected" ? "applicant" : "creator",
  previousCreatorData: status === "rejected" ? null : creatorData,
  historyAvailableUntil: "2026-11-20T12:00:00.000Z",
  profile: status === "rejected" ? null : profile,
  contracts: status === "rejected" ? [] : [contract],
})

const campaignWorkspace = (
  activeCampaign: UgcCampaign,
  extra: Partial<UgcWorkspace> = {},
) => baseWorkspace(user("creator", creatorData), {
  campaigns: [activeCampaign],
  groups: [group(activeCampaign.id)],
  memberships: [membership],
  ...extra,
})

export function creatorWorkspaceFor(scenario: CreatorAppScenario): UgcWorkspace {
  if (scenario === "application") return baseWorkspace(null)
  if (scenario === "applicationPending") return baseWorkspace(user("applicant", { _tag: "ApplicantData", source: "inbound", outboundManagerId: null, appliedAt: "2026-08-18T10:00:00.000Z", profile }))
  if (scenario === "applicationRejected") return baseWorkspace(terminal("rejected", "No hay campañas compatibles con tu perfil en este momento."))
  if (scenario === "onboarding") return baseWorkspace(onboarding(incompleteRequirements, null))
  if (scenario === "contractReady") {
    const creator = onboarding(preMeetRequirements, { ...contract, signedAt: null })
    return baseWorkspace(creator, { meets: [new UgcMeet({ id: makeUgcMeetId("71000000-0000-4000-8000-000000000033"), managerId, creatorId, status: "attended", startsAt: "2026-08-20T10:00:00.000Z", durationMinutes: 30, notes: null, createdAt: asOf, updatedAt: asOf })] })
  }
  if (scenario === "meetingPending") {
    const creator = onboarding(preMeetRequirements, null)
    return baseWorkspace(creator, { meets: [new UgcMeet({ id: makeUgcMeetId("71000000-0000-4000-8000-000000000031"), managerId, creatorId: null, status: "available", startsAt: "2026-08-25T10:00:00.000Z", durationMinutes: 30, notes: null, createdAt: asOf, updatedAt: asOf })] })
  }
  if (scenario === "meetingScheduled") {
    const creator = onboarding(preMeetRequirements, null)
    return baseWorkspace(creator, { meets: [new UgcMeet({ id: makeUgcMeetId("71000000-0000-4000-8000-000000000032"), managerId, creatorId, status: "reserved", startsAt: "2026-08-25T10:00:00.000Z", durationMinutes: 30, notes: null, createdAt: asOf, updatedAt: asOf })] })
  }
  if (scenario === "trialWarming" || scenario === "trialPublishing" || scenario === "trialReview") {
    const dates: readonly [string, string] = scenario === "trialWarming"
      ? ["2026-08-24T10:00:00.000Z", "2026-09-01T10:00:00.000Z"]
      : scenario === "trialPublishing"
        ? ["2026-08-20T10:00:00.000Z", "2026-08-30T10:00:00.000Z"]
        : ["2026-08-10T10:00:00.000Z", "2026-08-21T10:00:00.000Z"]
    return baseWorkspace(user("trial", { _tag: "TrialData", startedAt: "2026-08-18T10:00:00.000Z", publishingStartsAt: dates[0], publishingEndsAt: dates[1], requiredVideoCount: 8, completionCompensationCents: 7_200, currency: "EUR", maxVideosPerDay: 2, minVideosPerWeek: 1, allowedFormats: ["testimonial", "review", "routine"], requiredPlatforms: ["tiktok", "instagram"], outboundTrialPassBonusCents: 2_000, contract, contracts: [contract], profile, acquisition: { source: "inbound", outboundManagerId: null } }), scenario === "trialPublishing" ? { videos: videos.slice(0, 2).map((item) => new UgcVideo({ ...item, campaignId: null })) } : {})
  }
  if (scenario === "disqualified") return baseWorkspace(terminal("disqualified", "El periodo de prueba ha finalizado sin alcanzar los criterios necesarios."))
  if (scenario === "waitingCampaign") return baseWorkspace(user("creator", creatorData))
  if (scenario === "campaignScheduled") return campaignWorkspace(campaign(campaignId, "GlowUp España", "published", "2026-08-25T10:00:00.000Z", "2026-09-03T10:00:00.000Z", "2026-09-10T10:00:00.000Z"))
  if (scenario === "campaignActive") return campaignWorkspace(campaign(campaignId, "GlowUp España", "published", "2026-08-10T10:00:00.000Z", "2026-08-30T10:00:00.000Z", "2026-09-06T10:00:00.000Z"), { videos: videos.slice(0, 2) })
  if (scenario === "campaignReview") return campaignWorkspace(campaign(campaignId, "GlowUp España", "published", "2026-08-01T10:00:00.000Z", "2026-08-21T10:00:00.000Z", "2026-08-29T10:00:00.000Z"), { videos })
  if (scenario === "suspended") return baseWorkspace(terminal("suspended", "Estamos revisando una incidencia con tu cuenta."), { campaigns: [campaign(previousCampaignId, "Summer Skin", "finalized", "2026-07-01T10:00:00.000Z", "2026-07-20T10:00:00.000Z", "2026-07-27T10:00:00.000Z")], videos, videoData })
  if (scenario === "exited") return baseWorkspace(terminal("exited", "La colaboración se cerró el 12 de agosto."), { campaigns: [campaign(previousCampaignId, "Summer Skin", "finalized", "2026-07-01T10:00:00.000Z", "2026-07-20T10:00:00.000Z", "2026-07-27T10:00:00.000Z")], videos, videoData })

  const previousCampaign = campaign(previousCampaignId, "Summer Skin", "finalized", "2026-07-01T10:00:00.000Z", "2026-07-20T10:00:00.000Z", "2026-07-27T10:00:00.000Z")
  const payment = new UgcPayment({ id: makeUgcPaymentId("71000000-0000-4000-8000-000000000041"), recipientUserId: creatorId, relatedCreatorId: creatorId, campaignId: previousCampaignId, kind: "creator_campaign", sourceKey: "creator-campaign:summer-skin", status: "pending", amountCents: 32_500, currency: "EUR", breakdown: { fixedAmountCents: 24_000, viewsBonusCents: 8_500, rankingBonusCents: 0, referralBonusCents: 0, manualAdjustmentCents: 0, adjustmentReason: null }, paidAt: null, createdAt: asOf, updatedAt: asOf })
  return baseWorkspace(user("creator", creatorData), { campaigns: [previousCampaign], videos, videoData, payments: scenario === "payments" ? [payment] : [] })
}
