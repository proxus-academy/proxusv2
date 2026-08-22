import { Schema } from "effect"
import { AccountId } from "../auth/model.js"

const uuid = <Brand extends string>(brand: Brand) => Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand(brand),
)

export const UgcUserId = uuid("UgcUserId")
export type UgcUserId = typeof UgcUserId.Type
export const makeUgcUserId = Schema.decodeUnknownSync(UgcUserId)

export const UgcCampaignId = uuid("UgcCampaignId")
export type UgcCampaignId = typeof UgcCampaignId.Type
export const makeUgcCampaignId = Schema.decodeUnknownSync(UgcCampaignId)

export const UgcGroupId = uuid("UgcGroupId")
export type UgcGroupId = typeof UgcGroupId.Type
export const makeUgcGroupId = Schema.decodeUnknownSync(UgcGroupId)

export const UgcGroupMemberId = uuid("UgcGroupMemberId")
export type UgcGroupMemberId = typeof UgcGroupMemberId.Type
export const makeUgcGroupMemberId = Schema.decodeUnknownSync(UgcGroupMemberId)

export const UgcMeetId = uuid("UgcMeetId")
export type UgcMeetId = typeof UgcMeetId.Type
export const makeUgcMeetId = Schema.decodeUnknownSync(UgcMeetId)

export const UgcVideoId = uuid("UgcVideoId")
export type UgcVideoId = typeof UgcVideoId.Type
export const makeUgcVideoId = Schema.decodeUnknownSync(UgcVideoId)

export const UgcVideoDataId = uuid("UgcVideoDataId")
export type UgcVideoDataId = typeof UgcVideoDataId.Type
export const makeUgcVideoDataId = Schema.decodeUnknownSync(UgcVideoDataId)

export const UgcPaymentId = uuid("UgcPaymentId")
export type UgcPaymentId = typeof UgcPaymentId.Type
export const makeUgcPaymentId = Schema.decodeUnknownSync(UgcPaymentId)

export const IsoDateTime = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)),
)

export const CountryCode = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Z]{2}$/)),
)

const shortText = Schema.String.pipe(Schema.check(Schema.isMinLength(1)), Schema.check(Schema.isMaxLength(200)))
const longText = Schema.String.pipe(Schema.check(Schema.isMinLength(1)), Schema.check(Schema.isMaxLength(2_000)))
const email = Schema.String.pipe(Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)))
const nonNegativeInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))
const positiveInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))

export const UgcUserType = Schema.Literals(["creator", "manager"])
export type UgcUserType = typeof UgcUserType.Type

export const UgcUserStatus = Schema.Literals([
  "lead",
  "applicant",
  "onboarding",
  "trial",
  "creator",
  "suspended",
  "rejected",
  "disqualified",
  "exited",
  "active",
  "disabled",
])
export type UgcUserStatus = typeof UgcUserStatus.Type

export const CreatorRequirement = Schema.Struct({
  id: shortText,
  label: shortText,
  completedAt: Schema.NullOr(IsoDateTime),
})
export type CreatorRequirement = typeof CreatorRequirement.Type

export const CreatorProfile = Schema.Struct({
  tiktokHandle: Schema.NullOr(shortText),
  instagramHandle: Schema.NullOr(shortText),
  phone: Schema.NullOr(shortText),
})
export type CreatorProfile = typeof CreatorProfile.Type

export const ContractSnapshot = Schema.Struct({
  generatedAt: IsoDateTime,
  signedAt: Schema.NullOr(IsoDateTime),
  locale: Schema.Literals(["es-ES", "es-LATAM"]),
  documentType: Schema.Literals(["DNI", "NIE", "Pasaporte", "Otro"]),
  documentNumber: shortText,
  address: longText,
  paymentMethod: Schema.Literals(["grade", "invoice"]),
  renderedDocument: longText,
})
export type ContractSnapshot = typeof ContractSnapshot.Type

export const ManagerData = Schema.TaggedStruct("ManagerData", {
  markets: Schema.Array(CountryCode),
  acceptsMeetings: Schema.Boolean,
  notes: Schema.NullOr(longText),
})
export const LeadData = Schema.TaggedStruct("LeadData", {
  source: Schema.Literal("outbound"),
  notes: Schema.NullOr(longText),
  createdByManagerId: UgcUserId,
})
export const ApplicantData = Schema.TaggedStruct("ApplicantData", {
  source: Schema.Literals(["inbound", "outbound"]),
  appliedAt: IsoDateTime,
  profile: CreatorProfile,
})
export const OnboardingData = Schema.TaggedStruct("OnboardingData", {
  acceptedAt: IsoDateTime,
  acceptedBy: UgcUserId,
  profile: CreatorProfile,
  requirements: Schema.Array(CreatorRequirement),
  missedMeetCount: nonNegativeInt,
  contract: Schema.NullOr(ContractSnapshot),
})
export const TrialData = Schema.TaggedStruct("TrialData", {
  startedAt: IsoDateTime,
  publishingStartsAt: IsoDateTime,
  publishingEndsAt: IsoDateTime,
  requiredVideoCount: positiveInt,
  contract: ContractSnapshot,
  profile: CreatorProfile,
})
export const CreatorData = Schema.TaggedStruct("CreatorData", {
  approvedAt: IsoDateTime,
  tierId: shortText,
  profile: CreatorProfile,
})
export const TerminalData = Schema.TaggedStruct("TerminalData", {
  reason: longText,
  decidedAt: IsoDateTime,
  decidedBy: UgcUserId,
  previousStatus: UgcUserStatus,
  previousCreatorData: Schema.NullOr(CreatorData),
})

export const UgcUserData = Schema.Union([
  ManagerData,
  LeadData,
  ApplicantData,
  OnboardingData,
  TrialData,
  CreatorData,
  TerminalData,
])
export type UgcUserData = typeof UgcUserData.Type

export class UgcUser extends Schema.Class<UgcUser>("UgcUser")({
  id: UgcUserId,
  authUserId: Schema.NullOr(AccountId),
  userType: UgcUserType,
  status: UgcUserStatus,
  displayName: shortText,
  email,
  countryCode: CountryCode,
  data: UgcUserData,
  version: positiveInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export const UgcCampaignStatus = Schema.Literals(["draft", "published", "finalized", "cancelled", "archived"])
export type UgcCampaignStatus = typeof UgcCampaignStatus.Type

export const CampaignTier = Schema.Struct({
  id: shortText,
  label: shortText,
  videoTarget: positiveInt,
  fixedAmountCents: nonNegativeInt,
})
export type CampaignTier = typeof CampaignTier.Type

export const CampaignBonusRule = Schema.Union([
  Schema.TaggedStruct("views", { threshold: positiveInt, amountCents: positiveInt }),
  Schema.TaggedStruct("topN", { positions: positiveInt, amountCents: positiveInt }),
  Schema.TaggedStruct("referrals", { threshold: positiveInt, amountCents: positiveInt }),
])
export type CampaignBonusRule = typeof CampaignBonusRule.Type

export const CampaignData = Schema.Struct({
  countries: Schema.Array(CountryCode),
  formats: Schema.Array(shortText),
  tiers: Schema.Array(CampaignTier),
  bonusRules: Schema.Array(CampaignBonusRule),
  currency: Schema.Literal("EUR"),
})
export type CampaignData = typeof CampaignData.Type

export class UgcCampaign extends Schema.Class<UgcCampaign>("UgcCampaign")({
  id: UgcCampaignId,
  name: shortText,
  status: UgcCampaignStatus,
  startsAt: IsoDateTime,
  submissionsCloseAt: IsoDateTime,
  reconciliationEndsAt: IsoDateTime,
  data: CampaignData,
  version: positiveInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export const UgcGroupStatus = Schema.Literals(["draft", "active", "completed", "cancelled"])
export class UgcGroup extends Schema.Class<UgcGroup>("UgcGroup")({
  id: UgcGroupId,
  campaignId: UgcCampaignId,
  managerId: UgcUserId,
  name: shortText,
  status: UgcGroupStatus,
  capacity: positiveInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export const UgcGroupMemberStatus = Schema.Literals(["scheduled", "active", "completed", "removed"])
export class UgcGroupMember extends Schema.Class<UgcGroupMember>("UgcGroupMember")({
  id: UgcGroupMemberId,
  groupId: UgcGroupId,
  creatorId: UgcUserId,
  tierId: shortText,
  status: UgcGroupMemberStatus,
  joinedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
}) {}

export const UgcMeetStatus = Schema.Literals(["available", "reserved", "attended", "missed", "cancelled"])
export class UgcMeet extends Schema.Class<UgcMeet>("UgcMeet")({
  id: UgcMeetId,
  managerId: UgcUserId,
  creatorId: Schema.NullOr(UgcUserId),
  status: UgcMeetStatus,
  startsAt: IsoDateTime,
  durationMinutes: positiveInt,
  notes: Schema.NullOr(longText),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export const UgcVideoStatus = Schema.Literals(["submitted", "changes_requested", "accepted", "rejected", "locked"])
export class UgcVideo extends Schema.Class<UgcVideo>("UgcVideo")({
  id: UgcVideoId,
  creatorId: UgcUserId,
  campaignId: Schema.NullOr(UgcCampaignId),
  status: UgcVideoStatus,
  format: shortText,
  reference: shortText,
  tiktokUrl: Schema.NullOr(Schema.String),
  instagramUrl: Schema.NullOr(Schema.String),
  submittedAt: IsoDateTime,
  reviewedAt: Schema.NullOr(IsoDateTime),
  reviewNotes: Schema.NullOr(longText),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class UgcVideoData extends Schema.Class<UgcVideoData>("UgcVideoData")({
  id: UgcVideoDataId,
  videoId: UgcVideoId,
  tiktokViews: nonNegativeInt,
  instagramViews: nonNegativeInt,
  capturedAt: IsoDateTime,
  source: Schema.Literals(["mock", "rapid-api", "manual"]),
}) {}

export const PaymentStatus = Schema.Literals(["pending", "paid", "cancelled"])
export const PaymentBreakdown = Schema.Struct({
  fixedAmountCents: nonNegativeInt,
  viewsBonusCents: nonNegativeInt,
  rankingBonusCents: nonNegativeInt,
  referralBonusCents: nonNegativeInt,
  manualAdjustmentCents: Schema.Int,
  adjustmentReason: Schema.NullOr(longText),
})
export type PaymentBreakdown = typeof PaymentBreakdown.Type

export class UgcPayment extends Schema.Class<UgcPayment>("UgcPayment")({
  id: UgcPaymentId,
  creatorId: UgcUserId,
  campaignId: UgcCampaignId,
  status: PaymentStatus,
  amountCents: Schema.Int,
  breakdown: PaymentBreakdown,
  paidAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export const UgcActorRole = Schema.Literals(["none", "creator", "manager", "admin"])
export class UgcWorkspace extends Schema.Class<UgcWorkspace>("UgcWorkspace")({
  asOf: IsoDateTime,
  role: UgcActorRole,
  currentUser: Schema.NullOr(UgcUser),
  users: Schema.Array(UgcUser),
  campaigns: Schema.Array(UgcCampaign),
  groups: Schema.Array(UgcGroup),
  memberships: Schema.Array(UgcGroupMember),
  meets: Schema.Array(UgcMeet),
  videos: Schema.Array(UgcVideo),
  videoData: Schema.Array(UgcVideoData),
  payments: Schema.Array(UgcPayment),
}) {}

export const CreatorEffectiveStatus = Schema.Literals([
  "lead",
  "application_pending",
  "requirements_pending",
  "meeting_pending",
  "meeting_scheduled",
  "trial_preparation",
  "trial_warming",
  "trial_publishing",
  "trial_review",
  "waiting_campaign",
  "campaign_scheduled",
  "campaign_active",
  "campaign_reconciliation",
  "suspended",
  "rejected",
  "disqualified",
  "exited",
])
export type CreatorEffectiveStatus = typeof CreatorEffectiveStatus.Type
