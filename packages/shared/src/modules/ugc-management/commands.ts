import { Schema } from "effect"
import { AccountId } from "../auth/model.js"
import {
  CampaignBonusRule,
  CampaignTier,
  CountryCode,
  IsoDateTime,
  UgcProgramConfigurationData,
  UgcCampaignId,
  UgcGroupId,
  UgcMeetId,
  UgcPaymentId,
  UgcUserId,
  UgcVideoId,
} from "./model.js"

const required = Schema.String.pipe(Schema.check(Schema.isMinLength(1)), Schema.check(Schema.isMaxLength(2_000)))
const positiveInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))

export class SubmitApplication extends Schema.TaggedClass<SubmitApplication>()("SubmitApplication", {
  displayName: required,
  email: required,
  countryCode: CountryCode,
  tiktokHandle: Schema.NullOr(required),
  instagramHandle: Schema.NullOr(required),
  phone: Schema.NullOr(required),
}) {}
export class CreateOutboundLead extends Schema.TaggedClass<CreateOutboundLead>()("CreateOutboundLead", {
  displayName: required,
  email: required,
  countryCode: CountryCode,
  notes: Schema.NullOr(required),
}) {}
export class AcceptApplication extends Schema.TaggedClass<AcceptApplication>()("AcceptApplication", { creatorId: UgcUserId }) {}
export class RejectApplication extends Schema.TaggedClass<RejectApplication>()("RejectApplication", { creatorId: UgcUserId, reason: required }) {}
export class CompleteRequirement extends Schema.TaggedClass<CompleteRequirement>()("CompleteRequirement", { requirementId: required }) {}
export class GenerateContract extends Schema.TaggedClass<GenerateContract>()("GenerateContract", {
  creatorId: UgcUserId,
  locale: Schema.Literals(["es-ES", "es-LATAM"]),
  documentType: Schema.Literals(["DNI", "NIE", "Pasaporte", "Otro"]),
  documentNumber: required,
  address: required,
  paymentMethod: Schema.Literals(["grade", "invoice"]),
}) {}
export class SignContract extends Schema.TaggedClass<SignContract>()("SignContract", {}) {}
export class RegisterSocialAccount extends Schema.TaggedClass<RegisterSocialAccount>()("RegisterSocialAccount", {
  tiktokHandle: required,
  instagramHandle: Schema.NullOr(required),
}) {}
export class CreateMeetSlot extends Schema.TaggedClass<CreateMeetSlot>()("CreateMeetSlot", {
  startsAt: IsoDateTime,
  durationMinutes: positiveInt,
}) {}
export class ReserveMeet extends Schema.TaggedClass<ReserveMeet>()("ReserveMeet", { meetId: UgcMeetId }) {}
export class EditMeet extends Schema.TaggedClass<EditMeet>()("EditMeet", {
  meetId: UgcMeetId,
  startsAt: IsoDateTime,
  durationMinutes: positiveInt,
}) {}
export class RecordMeetAttendance extends Schema.TaggedClass<RecordMeetAttendance>()("RecordMeetAttendance", {
  meetId: UgcMeetId,
  outcome: Schema.Literals(["attended", "missed"]),
  notes: Schema.NullOr(required),
}) {}
export class StartTrial extends Schema.TaggedClass<StartTrial>()("StartTrial", {
  creatorId: UgcUserId,
}) {}
export class EvaluateTrial extends Schema.TaggedClass<EvaluateTrial>()("EvaluateTrial", {
  creatorId: UgcUserId,
  outcome: Schema.Literals(["passed", "failed", "incomplete"]),
  tierId: Schema.NullOr(required),
  reason: Schema.NullOr(required),
}) {}
export class ConfigureUgcProgram extends Schema.TaggedClass<ConfigureUgcProgram>()("ConfigureUgcProgram", {
  market: CountryCode,
  data: UgcProgramConfigurationData,
}) {}
export class ConfigureManager extends Schema.TaggedClass<ConfigureManager>()("ConfigureManager", {
  authUserId: AccountId,
  displayName: required,
  email: required,
  countryCode: CountryCode,
  markets: Schema.Array(CountryCode),
  acceptsMeetings: Schema.Boolean,
}) {}
export class DisableManager extends Schema.TaggedClass<DisableManager>()("DisableManager", { managerId: UgcUserId }) {}
export class CreateCampaign extends Schema.TaggedClass<CreateCampaign>()("CreateCampaign", {
  name: required,
  startsAt: IsoDateTime,
  submissionsCloseAt: IsoDateTime,
  reconciliationEndsAt: IsoDateTime,
  countries: Schema.Array(CountryCode),
  formats: Schema.Array(required),
  tiers: Schema.Array(CampaignTier),
  bonusRules: Schema.Array(CampaignBonusRule),
}) {}
export class PublishCampaign extends Schema.TaggedClass<PublishCampaign>()("PublishCampaign", { campaignId: UgcCampaignId }) {}
export class CreateGroup extends Schema.TaggedClass<CreateGroup>()("CreateGroup", {
  campaignId: UgcCampaignId,
  managerId: UgcUserId,
  name: required,
  capacity: positiveInt,
}) {}
export class ImportGroupConfiguration extends Schema.TaggedClass<ImportGroupConfiguration>()("ImportGroupConfiguration", {
  sourceCampaignId: UgcCampaignId,
  targetCampaignId: UgcCampaignId,
}) {}
export class AssignCreatorToGroup extends Schema.TaggedClass<AssignCreatorToGroup>()("AssignCreatorToGroup", {
  creatorId: UgcUserId,
  groupId: UgcGroupId,
  tierId: required,
}) {}
export class SubmitVideo extends Schema.TaggedClass<SubmitVideo>()("SubmitVideo", {
  campaignId: Schema.NullOr(UgcCampaignId),
  format: required,
  reference: required,
  tiktokUrl: Schema.NullOr(Schema.String),
  instagramUrl: Schema.NullOr(Schema.String),
}) {}
export class ReviewVideo extends Schema.TaggedClass<ReviewVideo>()("ReviewVideo", {
  videoId: UgcVideoId,
  outcome: Schema.Literals(["accepted", "changes_requested", "rejected"]),
  notes: Schema.NullOr(required),
}) {}
export class RefreshVideoMetrics extends Schema.TaggedClass<RefreshVideoMetrics>()("RefreshVideoMetrics", { videoId: UgcVideoId }) {}
export class FinalizeCampaign extends Schema.TaggedClass<FinalizeCampaign>()("FinalizeCampaign", { campaignId: UgcCampaignId }) {}
export class GeneratePayments extends Schema.TaggedClass<GeneratePayments>()("GeneratePayments", { campaignId: UgcCampaignId }) {}
export class AdjustPayment extends Schema.TaggedClass<AdjustPayment>()("AdjustPayment", {
  paymentId: UgcPaymentId,
  amountCents: Schema.Int,
  reason: required,
}) {}
export class MarkPaymentPaid extends Schema.TaggedClass<MarkPaymentPaid>()("MarkPaymentPaid", { paymentId: UgcPaymentId }) {}
export class SuspendCreator extends Schema.TaggedClass<SuspendCreator>()("SuspendCreator", { creatorId: UgcUserId, reason: required }) {}
export class ResumeCreator extends Schema.TaggedClass<ResumeCreator>()("ResumeCreator", { creatorId: UgcUserId }) {}
export class ExitCreator extends Schema.TaggedClass<ExitCreator>()("ExitCreator", { creatorId: UgcUserId, reason: required }) {}

export const UgcCommand = Schema.Union([
  SubmitApplication,
  CreateOutboundLead,
  AcceptApplication,
  RejectApplication,
  CompleteRequirement,
  GenerateContract,
  SignContract,
  RegisterSocialAccount,
  CreateMeetSlot,
  ReserveMeet,
  EditMeet,
  RecordMeetAttendance,
  StartTrial,
  EvaluateTrial,
  ConfigureUgcProgram,
  ConfigureManager,
  DisableManager,
  CreateCampaign,
  PublishCampaign,
  CreateGroup,
  ImportGroupConfiguration,
  AssignCreatorToGroup,
  SubmitVideo,
  ReviewVideo,
  RefreshVideoMetrics,
  FinalizeCampaign,
  GeneratePayments,
  AdjustPayment,
  MarkPaymentPaid,
  SuspendCreator,
  ResumeCreator,
  ExitCreator,
])
export type UgcCommand = typeof UgcCommand.Type
