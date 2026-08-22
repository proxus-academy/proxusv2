import { Forbidden } from "@proxus/shared/access-control"
import type { AccountId } from "@proxus/shared/auth"
import {
  UgcCampaign,
  UgcConflict,
  UgcEntityNotFound,
  UgcGroup,
  UgcGroupMember,
  UgcInvalidTransition,
  UgcMeet,
  UgcPayment,
  UgcProgramConfiguration,
  UgcUser,
  UgcVideo,
  UgcVideoData,
  makeUgcCampaignId,
  makeUgcGroupId,
  makeUgcGroupMemberId,
  makeUgcMeetId,
  makeUgcPaymentId,
  makeUgcUserId,
  makeUgcVideoDataId,
  makeUgcVideoId,
  type AgreementTerms,
  type ContractSnapshot,
  type UgcCampaignId,
  type UgcCommand,
  type UgcGroupMember as UgcGroupMemberType,
  type UgcUser as UgcUserType,
} from "@proxus/shared/ugc-management"
import { Clock, DateTime, Effect, Layer, Option } from "effect"
import { agreementTermsKey, campaignAgreementTerms, campaignsOverlap, defaultProgramConfigurationData, managerCanHandleCreator, termsSnapshotKey, trialAgreementTerms } from "./policy.js"
import { UgcContractRenderer, UgcIdGenerator, UgcVideoMetricsProvider } from "./ports.js"
import { UgcManagementService } from "./service.js"
import { UgcRepository, type UgcMemoryState, type UgcRepositoryContract, type UgcRepositoryError } from "./repository.js"
import { scopeWorkspace } from "./workspace.js"

type Actor = { readonly authUserId: AccountId; readonly current: UgcUserType | null; readonly admin: boolean }

const forbidden = (_actor: Actor, message: string) => new Forbidden({ message })
const invalid = (message: string) => new UgcInvalidTransition({ message })
const conflict = (message: string) => new UgcConflict({ message })
const missing = (entity: string, id: string) => new UgcEntityNotFound({ entity, id })
const optional = <A>(value: Option.Option<A>) => Option.getOrNull(value)

const updateUser = (user: UgcUserType, now: string, fields: Partial<Pick<UgcUserType, "status" | "data" | "authUserId" | "displayName" | "email" | "countryCode">>) =>
  new UgcUser({ ...user, ...fields, version: user.version + 1, updatedAt: now })

const terminalData = (user: UgcUserType, actor: Actor, now: string, reason: string, historyRetentionDays = 90) => ({
  _tag: "TerminalData" as const,
  reason,
  decidedAt: now,
  decidedBy: actor.current?.id ?? makeUgcUserId("00000000-0000-4000-8000-000000000000"),
  previousStatus: user.status,
  previousCreatorData: user.data._tag === "CreatorData" ? user.data : null,
  historyAvailableUntil: addDays(now, historyRetentionDays),
  profile: user.data._tag === "ApplicantData" || user.data._tag === "OnboardingData" || user.data._tag === "TrialData" || user.data._tag === "CreatorData" ? user.data.profile : null,
  contracts: contractsOf(user),
})

const loadState = (repository: UgcRepositoryContract): Effect.Effect<UgcMemoryState, UgcRepositoryError> => Effect.gen(function*() {
  const [users, campaigns, groups, memberships, meets, videos, videoData, payments, programConfigurations] = yield* Effect.all([
    repository.users.list(), repository.campaigns.list(), repository.groups.list(), repository.memberships.list(),
    repository.meets.list(), repository.videos.list(), repository.videoData.list(), repository.payments.list(), repository.programConfigurations.list(),
  ], { concurrency: "unbounded" })
  return { users, campaigns, groups, memberships, meets, videos, videoData, payments, programConfigurations }
})

const isManager = (actor: Actor) => actor.current?.userType === "manager" && actor.current.status === "active"
const requireManager = (actor: Actor) => actor.admin || isManager(actor)
  ? Effect.void
  : Effect.fail(forbidden(actor, "Manager or administrator role required"))
const requireAdmin = (actor: Actor) => actor.admin
  ? Effect.void
  : Effect.fail(forbidden(actor, "Administrator role required"))
const requireCreator = (actor: Actor) => actor.current?.userType === "creator"
  ? Effect.succeed(actor.current)
  : Effect.fail(forbidden(actor, "Creator role required"))

const canManageCreator = (actor: Actor, creator: UgcUserType, state: UgcMemoryState) => {
  if (actor.admin) return true
  const manager = actor.current
  if (manager === null || !managerCanHandleCreator(manager, creator)) return false
  if (creator.status === "applicant" || (creator.status === "lead" && creator.data._tag === "LeadData" && creator.data.createdByManagerId === manager.id)) return true
  if (creator.status === "onboarding" && creator.data._tag === "OnboardingData" && creator.data.acceptedBy === manager.id) return true
  if (creator.data._tag === "TerminalData" && creator.data.decidedBy === manager.id) return true
  const ownedGroups = new Set(state.groups.filter((group) => group.managerId === manager.id).map((group) => group.id))
  return state.memberships.some((membership) => membership.creatorId === creator.id && ownedGroups.has(membership.groupId)) ||
    state.meets.some((meet) => meet.creatorId === creator.id && meet.managerId === manager.id)
}

const latestViews = (videoId: string, state: UgcMemoryState) => state.videoData
  .filter((item) => item.videoId === videoId)
  .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]

const creatorCampaignViews = (creatorId: string, campaignId: string, state: UgcMemoryState) => state.videos
  .filter((video) => video.creatorId === creatorId && video.campaignId === campaignId && video.status === "accepted")
  .reduce((total, video) => {
    const metrics = latestViews(video.id, state)
    return total + (metrics?.tiktokViews ?? 0) + (metrics?.instagramViews ?? 0)
  }, 0)

const calculatePayment = (membership: UgcGroupMemberType, state: UgcMemoryState, now: string, id: string, rank: number) => {
  const group = state.groups.find((item) => item.id === membership.groupId)
  const campaign = group === undefined ? undefined : state.campaigns.find((item) => item.id === group.campaignId)
  if (campaign === undefined) return undefined
  const tier = campaign.data.tiers.find((item) => item.id === membership.tierId)
  if (tier === undefined) return undefined
  const videos = state.videos.filter((video) => video.creatorId === membership.creatorId && video.campaignId === campaign.id && video.status === "accepted")
  let viewsBonusCents = 0
  for (const video of videos) {
    const metrics = latestViews(video.id, state)
    const views = (metrics?.tiktokViews ?? 0) + (metrics?.instagramViews ?? 0)
    const matching = campaign.data.bonusRules.flatMap((rule) => rule._tag === "views" && views >= rule.threshold ? [rule] : []).sort((a, b) => b.threshold - a.threshold)[0]
    viewsBonusCents += matching?.amountCents ?? 0
  }
  const rankingBonusCents = campaign.data.bonusRules
    .filter((rule) => rule._tag === "topN" && rank <= rule.positions)
    .reduce((highest, rule) => Math.max(highest, rule.amountCents), 0)
  const breakdown = { fixedAmountCents: tier.fixedAmountCents, viewsBonusCents, rankingBonusCents, referralBonusCents: 0, manualAdjustmentCents: 0, adjustmentReason: null }
  return new UgcPayment({
    id: makeUgcPaymentId(id), recipientUserId: membership.creatorId, relatedCreatorId: membership.creatorId, campaignId: campaign.id,
    kind: "creator_campaign", sourceKey: `creator-campaign:${campaign.id}:${membership.creatorId}`, status: "pending",
    amountCents: breakdown.fixedAmountCents + breakdown.viewsBonusCents + breakdown.rankingBonusCents, currency: campaign.data.currency,
    breakdown, paidAt: null, createdAt: now, updatedAt: now,
  })
}

const addDays = (iso: string, days: number) => DateTime.makeUnsafe(iso).pipe(DateTime.add({ days }), DateTime.formatIso)
const emptyBreakdown = () => ({ fixedAmountCents: 0, viewsBonusCents: 0, rankingBonusCents: 0, referralBonusCents: 0, manualAdjustmentCents: 0, adjustmentReason: null })
const latestSignedContract = (contracts: ReadonlyArray<ContractSnapshot>) => contracts.filter((contract) => contract.signedAt !== null).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0]
const contractsOf = (creator: UgcUserType): ReadonlyArray<ContractSnapshot> => creator.data._tag === "CreatorData" ? creator.data.contracts : creator.data._tag === "TrialData" ? creator.data.contracts : creator.data._tag === "OnboardingData" && creator.data.contract !== null ? [creator.data.contract] : []
const hasSignedTerms = (creator: UgcUserType, termsKey: string) => contractsOf(creator).some((contract) => contract.termsKey === termsKey && contract.signedAt !== null)
const percent = (amountCents: number, basisPoints: number) => Math.round(amountCents * basisPoints / 10_000)

const managerCommission = (creatorPayment: UgcPayment, membership: UgcGroupMemberType, state: UgcMemoryState, now: string, id: string) => {
  const group = state.groups.find((item) => item.id === membership.groupId)
  const campaign = group === undefined ? undefined : state.campaigns.find((item) => item.id === group.campaignId)
  if (group === undefined || campaign === undefined) return undefined
  const policy = campaign.data.managerIncentives
  const breakdown = {
    fixedAmountCents: percent(creatorPayment.breakdown.fixedAmountCents, policy.fixedPercentBasisPoints),
    viewsBonusCents: percent(creatorPayment.breakdown.viewsBonusCents, policy.viewsBonusPercentBasisPoints),
    rankingBonusCents: percent(creatorPayment.breakdown.rankingBonusCents, policy.rankingBonusPercentBasisPoints),
    referralBonusCents: percent(creatorPayment.breakdown.referralBonusCents, policy.referralBonusPercentBasisPoints),
    manualAdjustmentCents: percent(creatorPayment.breakdown.manualAdjustmentCents, policy.manualAdjustmentPercentBasisPoints),
    adjustmentReason: null,
  }
  return new UgcPayment({
    id: makeUgcPaymentId(id), recipientUserId: group.managerId, relatedCreatorId: membership.creatorId, campaignId: campaign.id,
    kind: "manager_campaign_commission", sourceKey: `manager-campaign:${campaign.id}:${group.managerId}:${membership.creatorId}`,
    status: "pending", amountCents: breakdown.fixedAmountCents + breakdown.viewsBonusCents + breakdown.rankingBonusCents + breakdown.referralBonusCents + breakdown.manualAdjustmentCents, currency: campaign.data.currency,
    breakdown, paidAt: null, createdAt: now, updatedAt: now,
  })
}

export const UgcManagementServiceLive = Layer.effect(UgcManagementService, Effect.gen(function*() {
  const repository = yield* UgcRepository
  const ids = yield* UgcIdGenerator
  const contracts = yield* UgcContractRenderer
  const metrics = yield* UgcVideoMetricsProvider

  const actorFor = (authUserId: AccountId, admin: boolean) => repository.users.findByAuthUserId(authUserId).pipe(
    Effect.map((found) => ({ authUserId, current: optional(found), admin } satisfies Actor)),
  )
  const now = Clock.currentTimeMillis.pipe(Effect.map((millis) => DateTime.formatIso(DateTime.makeUnsafe(millis))))
  const workspace = (authUserId: AccountId, admin = false) => Effect.gen(function*() {
    const actor = yield* actorFor(authUserId, admin)
    const state = yield* loadState(repository)
    return scopeWorkspace(state, actor.current, admin, yield* now)
  })

  const execute = (authUserId: AccountId, command: UgcCommand, admin = false) => repository.transaction((repository) => Effect.gen(function*() {
    const actor = yield* actorFor(authUserId, admin)
    const timestamp = yield* now
    const state = yield* loadState(repository)
    const found = <A>(value: A | undefined, entity: string, id: string) => value === undefined ? Effect.fail(missing(entity, id)) : Effect.succeed(value)
    const findUser = (id: string) => found(state.users.find((item) => item.id === id), "ugc_user", id)
    const findCampaign = (id: string) => found(state.campaigns.find((item) => item.id === id), "campaign", id)
    const findGroup = (id: string) => found(state.groups.find((item) => item.id === id), "ugc_group", id)
    const findMeet = (id: string) => found(state.meets.find((item) => item.id === id), "meet", id)
    const findVideo = (id: string) => found(state.videos.find((item) => item.id === id), "video", id)
    const findPayment = (id: string) => found(state.payments.find((item) => item.id === id), "payment", id)
    const writeUser = (current: UgcUserType, next: UgcUserType) => repository.users.update(next, current.version)
    const configurationFor = (market: string) => state.programConfigurations.find((configuration) => configuration.market === market)?.data ?? defaultProgramConfigurationData(market)

    switch (command._tag) {
      case "SubmitApplication": {
        if (actor.current !== null) return yield* conflict("This account already has a UGC profile")
        const existing = optional(yield* repository.users.findByEmail(command.email.trim().toLowerCase()))
        if (existing !== null && existing.status !== "lead") return yield* conflict("This email already has a UGC application")
        const profile = { tiktokHandle: command.tiktokHandle, instagramHandle: command.instagramHandle, phone: command.phone }
        if (existing === null) {
          yield* repository.users.insert(new UgcUser({
            id: makeUgcUserId(yield* ids.next()), authUserId, userType: "creator", status: "applicant",
            displayName: command.displayName.trim(), email: command.email.trim().toLowerCase(), countryCode: command.countryCode,
            data: { _tag: "ApplicantData", source: "inbound", outboundManagerId: null, appliedAt: timestamp, profile },
            version: 1, createdAt: timestamp, updatedAt: timestamp,
          }))
        } else {
          yield* writeUser(existing, updateUser(existing, timestamp, {
            authUserId, status: "applicant", displayName: command.displayName.trim(), countryCode: command.countryCode,
            data: { _tag: "ApplicantData", source: "outbound", outboundManagerId: existing.data._tag === "LeadData" ? existing.data.createdByManagerId : null, appliedAt: timestamp, profile },
          }))
        }
        break
      }
      case "CreateOutboundLead": {
        yield* requireManager(actor)
        if (actor.current === null) return yield* forbidden(actor, "A manager profile is required")
        if (optional(yield* repository.users.findByEmail(command.email.trim().toLowerCase())) !== null) return yield* conflict("A UGC profile already uses this email")
        if (actor.current.data._tag !== "ManagerData" || !actor.current.data.markets.includes(command.countryCode)) return yield* forbidden(actor, "The lead market is outside this manager scope")
        yield* repository.users.insert(new UgcUser({
          id: makeUgcUserId(yield* ids.next()), authUserId: null, userType: "creator", status: "lead",
          displayName: command.displayName.trim(), email: command.email.trim().toLowerCase(), countryCode: command.countryCode,
          data: { _tag: "LeadData", source: "outbound", notes: command.notes, createdByManagerId: actor.current.id },
          version: 1, createdAt: timestamp, updatedAt: timestamp,
        }))
        break
      }
      case "AcceptApplication": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        if (creator.status !== "applicant" || creator.data._tag !== "ApplicantData") return yield* invalid("Only an applicant can be accepted")
        if (!canManageCreator(actor, creator, state)) return yield* forbidden(actor, "Creator is outside this manager scope")
        const managerId = actor.current?.id ?? makeUgcUserId("00000000-0000-4000-8000-000000000000")
        yield* writeUser(creator, updateUser(creator, timestamp, {
          status: "onboarding",
          data: {
            _tag: "OnboardingData", acceptedAt: timestamp, acceptedBy: managerId, profile: creator.data.profile, missedMeetCount: 0, contract: null,
            acquisition: { source: creator.data.source, outboundManagerId: creator.data.outboundManagerId },
            requirements: [
              { id: "profile", label: "Completar perfil", completedAt: timestamp },
              { id: "training", label: "Conocer Proxus", completedAt: null },
              { id: "contract", label: "Firmar contrato", completedAt: null },
              { id: "social", label: "Registrar cuenta social", completedAt: null },
            ],
          },
        }))
        break
      }
      case "RejectApplication":
      case "SuspendCreator":
      case "ExitCreator": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        if (!canManageCreator(actor, creator, state)) return yield* forbidden(actor, "Creator is outside this manager scope")
        const status = command._tag === "RejectApplication" ? "rejected" : command._tag === "SuspendCreator" ? "suspended" : "exited"
        yield* writeUser(creator, updateUser(creator, timestamp, { status, data: terminalData(creator, actor, timestamp, command.reason, configurationFor(creator.countryCode).historyRetentionDays) }))
        break
      }
      case "ResumeCreator": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        if (creator.status !== "suspended" || creator.data._tag !== "TerminalData" || !canManageCreator(actor, creator, state)) return yield* invalid("Only a managed suspended creator can be resumed")
        if (creator.data.previousCreatorData === null) return yield* invalid("The suspended profile cannot be restored")
        yield* writeUser(creator, updateUser(creator, timestamp, { status: "creator", data: creator.data.previousCreatorData }))
        break
      }
      case "CompleteRequirement": {
        const creator = yield* requireCreator(actor)
        if (creator.status !== "onboarding" || creator.data._tag !== "OnboardingData") return yield* invalid("Requirements can only be completed during onboarding")
        const requirements = creator.data.requirements.map((item) => item.id === command.requirementId ? { ...item, completedAt: timestamp } : item)
        if (!requirements.some((item) => item.id === command.requirementId)) return yield* missing("requirement", command.requirementId)
        yield* writeUser(creator, updateUser(creator, timestamp, { data: { ...creator.data, requirements } }))
        break
      }
      case "GenerateContract": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        if (creator.status !== "onboarding" || creator.data._tag !== "OnboardingData" || !canManageCreator(actor, creator, state)) return yield* invalid("Contract generation requires a managed onboarding creator")
        if (!state.meets.some((meet) => meet.creatorId === creator.id && meet.status === "attended")) return yield* invalid("The onboarding meeting must be attended before generating the agreement")
        const terms = trialAgreementTerms(configurationFor(creator.countryCode))
        const renderedDocument = yield* contracts.render({ creator, ...command, terms })
        const contract: ContractSnapshot = { generatedAt: timestamp, signedAt: null, scope: "trial", campaignId: null, termsKey: agreementTermsKey(terms), terms, locale: command.locale, documentType: command.documentType, documentNumber: command.documentNumber, address: command.address, paymentMethod: command.paymentMethod, renderedDocument }
        yield* writeUser(creator, updateUser(creator, timestamp, { data: { ...creator.data, contract } }))
        break
      }
      case "SignContract": {
        const creator = yield* requireCreator(actor)
        if (creator.status === "onboarding" && creator.data._tag === "OnboardingData" && creator.data.contract !== null && creator.data.contract.signedAt === null) {
          const requirements = creator.data.requirements.map((item) => item.id === "contract" ? { ...item, completedAt: timestamp } : item)
          yield* writeUser(creator, updateUser(creator, timestamp, { data: { ...creator.data, requirements, contract: { ...creator.data.contract, signedAt: timestamp } } }))
          break
        }
        if (creator.status === "creator" && creator.data._tag === "CreatorData") {
          const pendingIndex = creator.data.contracts.findIndex((contract) => contract.signedAt === null)
          if (pendingIndex < 0) return yield* invalid("A generated campaign agreement is required")
          const pending = creator.data.contracts[pendingIndex]
          if (pending === undefined) return yield* invalid("A generated campaign agreement is required")
          const contracts = creator.data.contracts.map((contract, index) => index === pendingIndex ? { ...contract, signedAt: timestamp } : contract)
          yield* writeUser(creator, updateUser(creator, timestamp, { data: { ...creator.data, contracts } }))
          for (const membership of state.memberships.filter((item) => item.creatorId === creator.id && item.status === "awaiting_contract" && item.agreementTermsKey === pending.termsKey)) {
            const group = state.groups.find((item) => item.id === membership.groupId)
            const campaign = group === undefined ? undefined : state.campaigns.find((item) => item.id === group.campaignId)
            if (campaign !== undefined) yield* repository.memberships.update(new UgcGroupMember({ ...membership, status: Date.parse(timestamp) < Date.parse(campaign.startsAt) ? "scheduled" : "active" }))
          }
          break
        }
        return yield* invalid("A generated contract is required")
      }
      case "RegisterSocialAccount": {
        const creator = yield* requireCreator(actor)
        if (creator.status !== "onboarding" || creator.data._tag !== "OnboardingData") return yield* invalid("Social accounts are registered during onboarding")
        if (!state.meets.some((meet) => meet.creatorId === creator.id && meet.status === "attended")) return yield* invalid("The onboarding meeting must be attended before registering publication accounts")
        const requirements = creator.data.requirements.map((item) => item.id === "social" ? { ...item, completedAt: timestamp } : item)
        yield* writeUser(creator, updateUser(creator, timestamp, {
          data: {
            ...creator.data,
            profile: { ...creator.data.profile, tiktokHandle: command.tiktokHandle, instagramHandle: command.instagramHandle },
            requirements,
          },
        }))
        break
      }
      case "CreateMeetSlot": {
        yield* requireManager(actor)
        if (actor.current === null || actor.current.userType !== "manager" || actor.current.data._tag !== "ManagerData" || !actor.current.data.acceptsMeetings) return yield* forbidden(actor, "This manager cannot create meetings")
        if (Date.parse(command.startsAt) <= Date.parse(timestamp) || state.meets.some((meet) => meet.managerId === actor.current?.id && meet.startsAt === command.startsAt && meet.status !== "cancelled")) return yield* conflict("The meeting slot must be future and available")
        yield* repository.meets.insert(new UgcMeet({ id: makeUgcMeetId(yield* ids.next()), managerId: actor.current.id, creatorId: null, status: "available", startsAt: command.startsAt, durationMinutes: command.durationMinutes, notes: null, createdAt: timestamp, updatedAt: timestamp }))
        break
      }
      case "ReserveMeet": {
        const creator = yield* requireCreator(actor)
        const meet = yield* findMeet(command.meetId)
        const manager = yield* findUser(meet.managerId)
        const preMeetIncomplete = creator.data._tag === "OnboardingData" && creator.data.requirements.some((item) => (item.id === "profile" || item.id === "training") && item.completedAt === null)
        if (creator.status !== "onboarding" || creator.data._tag !== "OnboardingData" || preMeetIncomplete || meet.status !== "available" || manager.data._tag !== "ManagerData" || !manager.data.acceptsMeetings || !managerCanHandleCreator(manager, creator) || state.meets.some((item) => item.creatorId === creator.id && item.status === "reserved")) return yield* invalid("This meeting cannot be reserved")
        yield* repository.meets.update(new UgcMeet({ ...meet, creatorId: creator.id, status: "reserved", updatedAt: timestamp }))
        break
      }
      case "EditMeet": {
        const meet = yield* findMeet(command.meetId)
        if (!actor.admin && actor.current?.id !== meet.managerId) return yield* forbidden(actor, "Only the meeting manager or an administrator can edit it")
        yield* repository.meets.update(new UgcMeet({ ...meet, startsAt: command.startsAt, durationMinutes: command.durationMinutes, updatedAt: timestamp }))
        break
      }
      case "RecordMeetAttendance": {
        const meet = yield* findMeet(command.meetId)
        if (!actor.admin && actor.current?.id !== meet.managerId) return yield* forbidden(actor, "Only the meeting manager can record attendance")
        if (meet.status !== "reserved" || meet.creatorId === null) return yield* invalid("Only a reserved meeting can record attendance")
        const creator = yield* findUser(meet.creatorId)
        yield* repository.meets.update(new UgcMeet({ ...meet, status: command.outcome, notes: command.notes, updatedAt: timestamp }))
        if (command.outcome === "missed" && creator.status === "onboarding" && creator.data._tag === "OnboardingData") {
          const missedMeetCount = creator.data.missedMeetCount + 1
          const next = missedMeetCount >= 2
            ? updateUser(creator, timestamp, { status: "disqualified", data: terminalData(creator, actor, timestamp, "Dos ausencias a reuniones de onboarding", configurationFor(creator.countryCode).historyRetentionDays) })
            : updateUser(creator, timestamp, { data: { ...creator.data, missedMeetCount } })
          yield* writeUser(creator, next)
        }
        break
      }
      case "StartTrial": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        if (creator.status !== "onboarding" || creator.data._tag !== "OnboardingData" || creator.data.contract?.signedAt === null || creator.data.contract === null || creator.data.requirements.some((item) => item.completedAt === null) || !canManageCreator(actor, creator, state)) return yield* invalid("The onboarding requirements and signed contract must be complete")
        const attended = state.meets.some((meet) => meet.creatorId === creator.id && meet.status === "attended")
        if (!attended) return yield* invalid("An attended onboarding meeting is required")
        const configuration = configurationFor(creator.countryCode)
        const terms = trialAgreementTerms(configuration)
        if (termsSnapshotKey(creator.data.contract.terms) !== termsSnapshotKey(terms)) return yield* invalid("The trial conditions changed and require a new agreement")
        const publishingStartsAt = addDays(timestamp, configuration.trial.warmingDays)
        const publishingEndsAt = addDays(publishingStartsAt, configuration.trial.durationDays)
        yield* writeUser(creator, updateUser(creator, timestamp, { status: "trial", data: {
          _tag: "TrialData", startedAt: timestamp, publishingStartsAt, publishingEndsAt,
          requiredVideoCount: configuration.trial.requiredVideoCount, completionCompensationCents: configuration.trial.completionCompensationCents,
          currency: configuration.trial.currency, maxVideosPerDay: configuration.trial.maxVideosPerDay, minVideosPerWeek: configuration.trial.minVideosPerWeek,
          allowedFormats: configuration.trial.formats, requiredPlatforms: configuration.trial.requiredPlatforms,
          outboundTrialPassBonusCents: configuration.managerIncentives.outboundTrialPassBonusCents,
          contract: creator.data.contract, contracts: [creator.data.contract], profile: creator.data.profile, acquisition: creator.data.acquisition,
        } }))
        break
      }
      case "EvaluateTrial": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        if (creator.status !== "trial" || creator.data._tag !== "TrialData" || Date.parse(timestamp) < Date.parse(creator.data.publishingEndsAt) || !canManageCreator(actor, creator, state)) return yield* invalid("The completed trial is required")
        const acceptedVideos = state.videos.filter((video) => video.creatorId === creator.id && video.campaignId === null && video.status === "accepted").length
        const completed = acceptedVideos >= creator.data.requiredVideoCount
        if (command.outcome !== "incomplete" && !completed) return yield* invalid("A completed trial needs all required videos validated")
        if (command.outcome === "incomplete" && completed) return yield* invalid("A completed trial must be evaluated as passed or failed")
        if (completed) {
          const breakdown = { ...emptyBreakdown(), fixedAmountCents: creator.data.completionCompensationCents }
          yield* repository.payments.insert(new UgcPayment({
            id: makeUgcPaymentId(yield* ids.next()), recipientUserId: creator.id, relatedCreatorId: creator.id, campaignId: null,
            kind: "trial_compensation", sourceKey: `trial:${creator.id}:${creator.data.startedAt}`, status: "pending",
            amountCents: creator.data.completionCompensationCents, currency: creator.data.currency, breakdown, paidAt: null, createdAt: timestamp, updatedAt: timestamp,
          }))
        }
        if (command.outcome === "failed" || command.outcome === "incomplete") {
          yield* writeUser(creator, updateUser(creator, timestamp, { status: "disqualified", data: terminalData(creator, actor, timestamp, command.reason ?? "Periodo de prueba no superado", configurationFor(creator.countryCode).historyRetentionDays) }))
        } else {
          if (command.tierId === null) return yield* invalid("A passed trial needs an initial tier")
          yield* writeUser(creator, updateUser(creator, timestamp, { status: "creator", data: { _tag: "CreatorData", approvedAt: timestamp, tierId: command.tierId, profile: creator.data.profile, contracts: creator.data.contracts, acquisition: creator.data.acquisition } }))
          if (creator.data.acquisition.source === "outbound" && creator.data.acquisition.outboundManagerId !== null && creator.data.outboundTrialPassBonusCents > 0) {
            const breakdown = { ...emptyBreakdown(), fixedAmountCents: creator.data.outboundTrialPassBonusCents }
            yield* repository.payments.insert(new UgcPayment({
              id: makeUgcPaymentId(yield* ids.next()), recipientUserId: creator.data.acquisition.outboundManagerId, relatedCreatorId: creator.id, campaignId: null,
              kind: "manager_outbound_conversion", sourceKey: `outbound-trial-pass:${creator.id}:${creator.data.startedAt}`, status: "pending",
              amountCents: creator.data.outboundTrialPassBonusCents, currency: creator.data.currency, breakdown, paidAt: null, createdAt: timestamp, updatedAt: timestamp,
            }))
          }
        }
        break
      }
      case "ConfigureUgcProgram": {
        yield* requireAdmin(actor)
        const existing = state.programConfigurations.find((configuration) => configuration.market === command.market)
        if (existing === undefined) yield* repository.programConfigurations.insert(new UgcProgramConfiguration({ market: command.market, data: command.data, version: 1, updatedAt: timestamp }))
        else yield* repository.programConfigurations.update(new UgcProgramConfiguration({ ...existing, data: command.data, version: existing.version + 1, updatedAt: timestamp }), existing.version)
        break
      }
      case "ConfigureManager": {
        yield* requireAdmin(actor)
        const existing = optional(yield* repository.users.findByAuthUserId(command.authUserId))
        const data = { _tag: "ManagerData" as const, markets: command.markets, acceptsMeetings: command.acceptsMeetings, notes: null }
        if (existing === null) yield* repository.users.insert(new UgcUser({ id: makeUgcUserId(yield* ids.next()), authUserId: command.authUserId, userType: "manager", status: "active", displayName: command.displayName, email: command.email.toLowerCase(), countryCode: command.countryCode, data, version: 1, createdAt: timestamp, updatedAt: timestamp }))
        else if (existing.userType !== "manager") return yield* conflict("The account already belongs to a creator")
        else yield* writeUser(existing, updateUser(existing, timestamp, { status: "active", data }))
        break
      }
      case "DisableManager": {
        yield* requireAdmin(actor)
        const manager = yield* findUser(command.managerId)
        if (manager.userType !== "manager") return yield* invalid("Only a manager can be disabled")
        yield* writeUser(manager, updateUser(manager, timestamp, { status: "disabled" }))
        break
      }
      case "CreateCampaign": {
        yield* requireAdmin(actor)
        if (!(Date.parse(command.startsAt) < Date.parse(command.submissionsCloseAt) && Date.parse(command.submissionsCloseAt) < Date.parse(command.reconciliationEndsAt))) return yield* invalid("Campaign dates must be strictly ordered")
        const primaryMarket = command.countries[0]
        if (primaryMarket === undefined) return yield* invalid("A campaign needs at least one market")
        const configuration = configurationFor(primaryMarket)
        if (command.countries.some((market) => configurationFor(market).trial.currency !== configuration.trial.currency)) return yield* invalid("All campaign markets must use the same currency")
        yield* repository.campaigns.insert(new UgcCampaign({ id: makeUgcCampaignId(yield* ids.next()), name: command.name, status: "draft", startsAt: command.startsAt, submissionsCloseAt: command.submissionsCloseAt, reconciliationEndsAt: command.reconciliationEndsAt, data: {
          countries: command.countries, formats: command.formats, tiers: command.tiers, bonusRules: command.bonusRules,
          currency: configuration.trial.currency, contractPolicy: configuration.contractPolicy,
          requiredPlatforms: configuration.trial.requiredPlatforms, managerIncentives: configuration.managerIncentives,
        }, version: 1, createdAt: timestamp, updatedAt: timestamp }))
        break
      }
      case "PublishCampaign": {
        yield* requireAdmin(actor)
        const campaign = yield* findCampaign(command.campaignId)
        if (campaign.status !== "draft") return yield* invalid("Only a draft campaign can be published")
        const groups = state.groups.filter((group) => group.campaignId === campaign.id)
        if (groups.length === 0) return yield* invalid("A campaign needs at least one group")
        yield* repository.campaigns.update(new UgcCampaign({ ...campaign, status: "published", version: campaign.version + 1, updatedAt: timestamp }), campaign.version)
        for (const group of groups) yield* repository.groups.update(new UgcGroup({ ...group, status: "active", updatedAt: timestamp }))
        break
      }
      case "CreateGroup": {
        yield* requireAdmin(actor)
        const campaign = yield* findCampaign(command.campaignId)
        const manager = yield* findUser(command.managerId)
        if (campaign.status !== "draft" || manager.userType !== "manager" || manager.status !== "active" || manager.data._tag !== "ManagerData" || !campaign.data.countries.some((country) => manager.data._tag === "ManagerData" && manager.data.markets.includes(country))) return yield* invalid("The draft campaign and a compatible active manager are required")
        yield* repository.groups.insert(new UgcGroup({ id: makeUgcGroupId(yield* ids.next()), campaignId: campaign.id, managerId: manager.id, name: command.name, status: "draft", capacity: command.capacity, createdAt: timestamp, updatedAt: timestamp }))
        break
      }
      case "ImportGroupConfiguration": {
        yield* requireAdmin(actor)
        const source = yield* findCampaign(command.sourceCampaignId)
        const target = yield* findCampaign(command.targetCampaignId)
        const sourceGroups = state.groups.filter((group) => group.campaignId === source.id && group.status !== "cancelled")
        const targetGroups = state.groups.filter((group) => group.campaignId === target.id)
        if (source.id === target.id || target.status !== "draft" || sourceGroups.length === 0 || targetGroups.length > 0) return yield* invalid("Import requires a different source with groups and an empty draft target")
        for (const group of sourceGroups) {
          const manager = yield* findUser(group.managerId)
          if (manager.userType !== "manager" || manager.status !== "active" || manager.data._tag !== "ManagerData" || !target.data.countries.some((country) => manager.data._tag === "ManagerData" && manager.data.markets.includes(country))) return yield* invalid("Every imported group needs an active manager compatible with the target campaign")
          yield* repository.groups.insert(new UgcGroup({ id: makeUgcGroupId(yield* ids.next()), campaignId: target.id, managerId: manager.id, name: group.name, status: "draft", capacity: group.capacity, createdAt: timestamp, updatedAt: timestamp }))
        }
        break
      }
      case "AssignCreatorToGroup": {
        yield* requireManager(actor)
        const creator = yield* findUser(command.creatorId)
        const group = yield* findGroup(command.groupId)
        const campaign = yield* findCampaign(group.campaignId)
        if (creator.status !== "creator" || creator.data._tag !== "CreatorData" || (campaign.status !== "draft" && campaign.status !== "published") || !campaign.data.countries.includes(creator.countryCode)) return yield* invalid("Creator is not eligible for this campaign")
        if (!actor.admin && actor.current?.id !== group.managerId) return yield* forbidden(actor, "Managers can only assign to their own groups")
        if (!campaign.data.tiers.some((tier) => tier.id === command.tierId)) return yield* invalid("Tier is not configured in the campaign")
        const members = state.memberships.filter((membership) => membership.groupId === group.id && membership.status !== "removed")
        if (members.length >= group.capacity) return yield* conflict("Group capacity reached")
        const creatorCampaigns = state.memberships.filter((membership) => membership.creatorId === creator.id && membership.status !== "removed").flatMap((membership) => {
          const existingGroup = state.groups.find((item) => item.id === membership.groupId)
          const existingCampaign = existingGroup === undefined ? undefined : state.campaigns.find((item) => item.id === existingGroup.campaignId)
          return existingCampaign === undefined ? [] : [existingCampaign]
        })
        if (creatorCampaigns.some((existing) => campaignsOverlap(existing, campaign))) return yield* conflict("Campaign dates overlap another creator assignment")
        const tier = campaign.data.tiers.find((item) => item.id === command.tierId)
        if (tier === undefined) return yield* invalid("Tier is not configured in the campaign")
        const terms = campaignAgreementTerms(campaign, tier)
        const termsKey = agreementTermsKey(terms)
        const signed = hasSignedTerms(creator, termsKey)
        if (!signed && !creator.data.contracts.some((contract) => contract.termsKey === termsKey && contract.signedAt === null)) {
          const identity = latestSignedContract(creator.data.contracts)
          if (identity === undefined) return yield* invalid("A signed creator agreement is required before campaign assignment")
          const renderedDocument = yield* contracts.render({ creator, locale: identity.locale, documentType: identity.documentType, documentNumber: identity.documentNumber, address: identity.address, paymentMethod: identity.paymentMethod, terms })
          const contract: ContractSnapshot = { generatedAt: timestamp, signedAt: null, scope: "campaign", campaignId: campaign.id, termsKey, terms, locale: identity.locale, documentType: identity.documentType, documentNumber: identity.documentNumber, address: identity.address, paymentMethod: identity.paymentMethod, renderedDocument }
          yield* writeUser(creator, updateUser(creator, timestamp, { data: { ...creator.data, contracts: [...creator.data.contracts, contract] } }))
        }
        yield* repository.memberships.insert(new UgcGroupMember({ id: makeUgcGroupMemberId(yield* ids.next()), groupId: group.id, creatorId: creator.id, tierId: command.tierId, agreementTermsKey: termsKey, status: signed ? Date.parse(timestamp) < Date.parse(campaign.startsAt) ? "scheduled" : "active" : "awaiting_contract", joinedAt: timestamp, completedAt: null }))
        break
      }
      case "SubmitVideo": {
        const creator = yield* requireCreator(actor)
        let campaignId: UgcCampaignId | null = command.campaignId
        if (creator.status === "trial" && creator.data._tag === "TrialData") {
          if (!(Date.parse(timestamp) >= Date.parse(creator.data.publishingStartsAt) && Date.parse(timestamp) < Date.parse(creator.data.publishingEndsAt))) return yield* invalid("Trial is outside its publishing window")
          if (!creator.data.allowedFormats.includes(command.format)) return yield* invalid("Video format is not allowed during the trial")
          if (creator.data.requiredPlatforms.includes("tiktok") && command.tiktokUrl === null) return yield* invalid("TikTok is required during the trial")
          if (creator.data.requiredPlatforms.includes("instagram") && command.instagramUrl === null) return yield* invalid("Instagram is required during the trial")
          const submittedToday = state.videos.filter((video) => video.creatorId === creator.id && video.campaignId === null && video.submittedAt.slice(0, 10) === timestamp.slice(0, 10)).length
          if (submittedToday >= creator.data.maxVideosPerDay) return yield* invalid("The daily trial video limit has been reached")
          campaignId = null
        } else if (creator.status === "creator" && campaignId !== null) {
          const campaign = yield* findCampaign(campaignId)
          const groupIds = new Set(state.groups.filter((group) => group.campaignId === campaign.id).map((group) => group.id))
          if (campaign.status !== "published" || Date.parse(timestamp) < Date.parse(campaign.startsAt) || Date.parse(timestamp) >= Date.parse(campaign.submissionsCloseAt) || !state.memberships.some((membership) => membership.creatorId === creator.id && groupIds.has(membership.groupId) && membership.status !== "removed" && membership.status !== "awaiting_contract")) return yield* invalid("Creator does not have an active campaign assignment")
          if (!campaign.data.formats.includes(command.format)) return yield* invalid("Video format is not allowed")
          if (campaign.data.requiredPlatforms.includes("tiktok") && command.tiktokUrl === null) return yield* invalid("TikTok is required for this campaign")
          if (campaign.data.requiredPlatforms.includes("instagram") && command.instagramUrl === null) return yield* invalid("Instagram is required for this campaign")
        } else return yield* invalid("Videos require an active trial or campaign")
        if (command.tiktokUrl === null && command.instagramUrl === null) return yield* invalid("At least one social link is required")
        yield* repository.videos.insert(new UgcVideo({ id: makeUgcVideoId(yield* ids.next()), creatorId: creator.id, campaignId, status: "submitted", format: command.format, reference: command.reference, tiktokUrl: command.tiktokUrl, instagramUrl: command.instagramUrl, submittedAt: timestamp, reviewedAt: null, reviewNotes: null, createdAt: timestamp, updatedAt: timestamp }))
        break
      }
      case "ReviewVideo": {
        yield* requireManager(actor)
        const video = yield* findVideo(command.videoId)
        const creator = yield* findUser(video.creatorId)
        if (!canManageCreator(actor, creator, state)) return yield* forbidden(actor, "Video creator is outside this manager scope")
        if (video.status !== "submitted" && video.status !== "changes_requested") return yield* invalid("This video cannot be reviewed")
        yield* repository.videos.update(new UgcVideo({ ...video, status: command.outcome, reviewedAt: timestamp, reviewNotes: command.notes, updatedAt: timestamp }))
        break
      }
      case "RefreshVideoMetrics": {
        yield* requireManager(actor)
        const video = yield* findVideo(command.videoId)
        const creator = yield* findUser(video.creatorId)
        if (!canManageCreator(actor, creator, state)) return yield* forbidden(actor, "Video creator is outside this manager scope")
        const result = yield* metrics.read(video)
        yield* repository.videoData.insert(new UgcVideoData({ id: makeUgcVideoDataId(yield* ids.next()), videoId: video.id, ...result, capturedAt: timestamp }))
        break
      }
      case "FinalizeCampaign": {
        yield* requireManager(actor)
        const campaign = yield* findCampaign(command.campaignId)
        if (campaign.status !== "published" || Date.parse(timestamp) < Date.parse(campaign.reconciliationEndsAt)) return yield* invalid("Campaign reconciliation must be complete")
        const campaignGroups = state.groups.filter((group) => group.campaignId === campaign.id)
        if (!actor.admin && !campaignGroups.some((group) => group.managerId === actor.current?.id)) return yield* forbidden(actor, "Manager is not assigned to this campaign")
        yield* repository.campaigns.update(new UgcCampaign({ ...campaign, status: "finalized", version: campaign.version + 1, updatedAt: timestamp }), campaign.version)
        for (const group of campaignGroups) yield* repository.groups.update(new UgcGroup({ ...group, status: "completed", updatedAt: timestamp }))
        for (const membership of state.memberships.filter((item) => campaignGroups.some((group) => group.id === item.groupId) && item.status !== "removed")) yield* repository.memberships.update(new UgcGroupMember({ ...membership, status: "completed", completedAt: timestamp }))
        break
      }
      case "GeneratePayments": {
        yield* requireAdmin(actor)
        const campaign = yield* findCampaign(command.campaignId)
        if (campaign.status !== "finalized") return yield* invalid("Payments require a finalized campaign")
        const groupIds = new Set(state.groups.filter((group) => group.campaignId === campaign.id).map((group) => group.id))
        const existingSourceKeys = new Set(state.payments.map((payment) => payment.sourceKey))
        const campaignMemberships = state.memberships.filter((item) => groupIds.has(item.groupId))
        const rankByCreator = new Map(campaignMemberships
          .map((membership) => ({ creatorId: membership.creatorId, views: creatorCampaignViews(membership.creatorId, campaign.id, state) }))
          .sort((left, right) => right.views - left.views || left.creatorId.localeCompare(right.creatorId))
          .map((item, index) => [item.creatorId, index + 1]))
        for (const membership of campaignMemberships) {
          const payment = calculatePayment(membership, state, timestamp, yield* ids.next(), rankByCreator.get(membership.creatorId) ?? Number.MAX_SAFE_INTEGER)
          if (payment !== undefined && !existingSourceKeys.has(payment.sourceKey)) {
            yield* repository.payments.insert(payment)
            const commission = managerCommission(payment, membership, state, timestamp, yield* ids.next())
            if (commission !== undefined && commission.amountCents !== 0 && !existingSourceKeys.has(commission.sourceKey)) yield* repository.payments.insert(commission)
          }
        }
        break
      }
      case "AdjustPayment": {
        yield* requireAdmin(actor)
        const payment = yield* findPayment(command.paymentId)
        if (payment.status !== "pending") return yield* invalid("Only pending payments can be adjusted")
        const breakdown = { ...payment.breakdown, manualAdjustmentCents: command.amountCents, adjustmentReason: command.reason }
        const amountCents = breakdown.fixedAmountCents + breakdown.viewsBonusCents + breakdown.rankingBonusCents + breakdown.referralBonusCents + breakdown.manualAdjustmentCents
        yield* repository.payments.update(new UgcPayment({ ...payment, amountCents, breakdown, updatedAt: timestamp }))
        if (payment.kind === "creator_campaign" && payment.campaignId !== null) {
          const campaign = yield* findCampaign(payment.campaignId)
          const commission = state.payments.find((item) => item.kind === "manager_campaign_commission" && item.campaignId === payment.campaignId && item.relatedCreatorId === payment.relatedCreatorId)
          if (commission !== undefined && commission.status === "pending") {
            const manualAdjustmentCents = percent(command.amountCents, campaign.data.managerIncentives.manualAdjustmentPercentBasisPoints)
            const commissionBreakdown = { ...commission.breakdown, manualAdjustmentCents, adjustmentReason: command.reason }
            const commissionAmount = commissionBreakdown.fixedAmountCents + commissionBreakdown.viewsBonusCents + commissionBreakdown.rankingBonusCents + commissionBreakdown.referralBonusCents + commissionBreakdown.manualAdjustmentCents
            yield* repository.payments.update(new UgcPayment({ ...commission, amountCents: commissionAmount, breakdown: commissionBreakdown, updatedAt: timestamp }))
          }
        }
        break
      }
      case "MarkPaymentPaid": {
        yield* requireAdmin(actor)
        const payment = yield* findPayment(command.paymentId)
        if (payment.status !== "pending") return yield* invalid("Only pending payments can be paid")
        yield* repository.payments.update(new UgcPayment({ ...payment, status: "paid", paidAt: timestamp, updatedAt: timestamp }))
        break
      }
    }
    const resultingActor = optional(yield* repository.users.findByAuthUserId(authUserId))
    return scopeWorkspace(yield* loadState(repository), resultingActor, admin, timestamp)
  }))

  return UgcManagementService.of({ workspace, execute })
}))
