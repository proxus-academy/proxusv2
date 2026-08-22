import { makeAccountId } from "@proxus/shared/auth"
import {
  AcceptApplication,
  AdjustPayment,
  AssignCreatorToGroup,
  CompleteRequirement,
  ConfigureManager,
  ConfigureUgcProgram,
  CreateCampaign,
  CreateGroup,
  CreateMeetSlot,
  CreateOutboundLead,
  DisableManager,
  EditMeet,
  EvaluateTrial,
  ExitCreator,
  FinalizeCampaign,
  GenerateContract,
  GeneratePayments,
  ImportGroupConfiguration,
  MarkPaymentPaid,
  PublishCampaign,
  RecordMeetAttendance,
  RefreshVideoMetrics,
  RegisterSocialAccount,
  RejectApplication,
  ReserveMeet,
  ResumeCreator,
  ReviewVideo,
  SignContract,
  StartTrial,
  SubmitApplication,
  SubmitVideo,
  SuspendCreator,
  UgcUser,
  UgcMeet,
  UgcVideo,
  makeUgcMeetId,
  makeUgcUserId,
  makeUgcVideoId,
  type UgcWorkspace,
} from "@proxus/shared/ugc-management"
import { Clock, Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { makeDeterministicUgcIdGenerator, UgcContractRendererTest, UgcVideoMetricsProviderTest } from "./ports.js"
import { agreementTermsKey } from "./policy.js"
import { emptyUgcMemoryState, makeMemoryUgcRepository, type UgcMemoryState } from "./repository.js"
import { UgcManagementServiceLive } from "./service.live.js"
import { UgcManagementService } from "./service.js"

const account = (suffix: number) => makeAccountId(`00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`)
const entityIds = Array.from({ length: 96 }, (_, index) => `10000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`)
const managerAccount = account(1)
const creatorAccount = account(2)
const adminAccount = account(3)
const contractPolicy = { contentRetentionMonths: 3, creatorNoticeDays: 5, paidMediaRightsAmountCents: 3_000, paidMediaRightsDurationMonths: 3, exclusivityRequired: true } as const
const managerIncentives = { fixedPercentBasisPoints: 500, viewsBonusPercentBasisPoints: 500, rankingBonusPercentBasisPoints: 500, referralBonusPercentBasisPoints: 0, manualAdjustmentPercentBasisPoints: 0, outboundTrialPassBonusCents: 2_000 } as const
const programData = {
  trial: { durationDays: 8, warmingDays: 1, requiredVideoCount: 1, maxVideosPerDay: 2, minVideosPerWeek: 1, formats: ["testimonial"], requiredPlatforms: ["tiktok", "instagram"] as const, completionCompensationCents: 7_200, currency: "EUR" as const },
  contractPolicy,
  managerIncentives,
  historyRetentionDays: 90,
}
const signedLegacyTerms = { contentTarget: 1, compensationCents: 1_000, currency: "EUR" as const, formats: ["testimonial"], requiredPlatforms: ["tiktok", "instagram"] as const, bonusRules: [], maxVideosPerDay: 2, minVideosPerWeek: 1, contractPolicy }
const signedLegacyContract = {
  generatedAt: "2026-08-01T00:00:00.000Z", signedAt: "2026-08-01T01:00:00.000Z", scope: "trial" as const, campaignId: null, termsKey: agreementTermsKey(signedLegacyTerms),
  terms: signedLegacyTerms,
  locale: "es-ES" as const, documentType: "DNI" as const, documentNumber: "12345678Z", address: "Madrid", paymentMethod: "grade" as const, renderedDocument: "Contrato firmado",
}

const withService = <A, E>(
  initial: UgcMemoryState,
  use: (service: typeof UgcManagementService.Service, setNow: (iso: string) => void) => Effect.Effect<A, E>,
) => {
  let currentMillis = Date.parse("2026-08-22T12:00:00.000Z")
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => currentMillis,
    currentTimeMillis: Effect.sync(() => currentMillis),
    currentTimeNanosUnsafe: () => BigInt(currentMillis) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(currentMillis) * 1_000_000n),
    sleep: () => Effect.void,
  }
  const dependencies = Layer.mergeAll(
    makeMemoryUgcRepository(initial),
    makeDeterministicUgcIdGenerator(entityIds),
    UgcContractRendererTest,
    UgcVideoMetricsProviderTest,
  )
  return Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(UgcManagementServiceLive.pipe(Layer.provide(dependencies)))
    const service = yield* UgcManagementService.pipe(Effect.provide(context))
    return yield* use(service, (iso) => { currentMillis = Date.parse(iso) })
  })).pipe(Effect.provideService(Clock.Clock, clock))
}

const current = (workspace: UgcWorkspace) => {
  if (workspace.currentUser === null) throw new Error("Expected a current UGC user")
  return workspace.currentUser
}

const required = <A>(value: A | null | undefined, label: string): A => {
  if (value === null || value === undefined) throw new Error(`Expected ${label}`)
  return value
}

const manager = new UgcUser({
  id: makeUgcUserId("20000000-0000-4000-8000-000000000001"),
  authUserId: managerAccount,
  userType: "manager",
  status: "active",
  displayName: "Marta Manager",
  email: "manager@proxus.test",
  countryCode: "ES",
  data: { _tag: "ManagerData", markets: ["ES", "MX"], acceptsMeetings: true, notes: null },
  version: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
})

const approvedCreator = (id: string, authUserId: ReturnType<typeof account>, displayName: string) => new UgcUser({
  id: makeUgcUserId(id), authUserId, userType: "creator", status: "creator",
  displayName, email: `${displayName.toLowerCase().replaceAll(" ", ".")}@proxus.test`, countryCode: "ES",
  data: { _tag: "CreatorData", approvedAt: "2026-08-01T00:00:00.000Z", tierId: "tier-1", profile: { tiktokHandle: `@${displayName.toLowerCase().replaceAll(" ", "")}`, instagramHandle: null, phone: null }, contracts: [signedLegacyContract], acquisition: { source: "inbound", outboundManagerId: null } },
  version: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
})

describe("UgcManagementServiceLive", () => {
  test("executes the complete inbound creator, campaign, video and payment journey", () => Effect.runPromise(
    withService({ ...emptyUgcMemoryState, users: [manager] }, (service, setNow) => Effect.gen(function*() {
      yield* service.execute(adminAccount, new ConfigureUgcProgram({ market: "ES", data: programData }), true)
      let workspace = yield* service.execute(creatorAccount, new SubmitApplication({
        displayName: "Clara Creator", email: "clara@proxus.test", countryCode: "ES",
        tiktokHandle: "@clara", instagramHandle: null, phone: "+34600000000",
      }))
      const creatorId = current(workspace).id
      expect(current(workspace).status).toBe("applicant")

      workspace = yield* service.execute(managerAccount, new AcceptApplication({ creatorId }))
      expect(workspace.users.find((user) => user.id === creatorId)?.status).toBe("onboarding")
      yield* service.execute(creatorAccount, new CompleteRequirement({ requirementId: "training" }))
      workspace = yield* service.execute(managerAccount, new CreateMeetSlot({ startsAt: "2026-08-23T10:00:00.000Z", durationMinutes: 30 }))
      const meetId = required(workspace.meets[0], "a meeting slot").id
      yield* service.execute(creatorAccount, new ReserveMeet({ meetId }))
      yield* service.execute(adminAccount, new EditMeet({ meetId, startsAt: "2026-08-23T10:30:00.000Z", durationMinutes: 45 }), true)
      yield* service.execute(managerAccount, new RecordMeetAttendance({ meetId, outcome: "attended", notes: "Buen encaje" }))
      yield* service.execute(managerAccount, new GenerateContract({
        creatorId, locale: "es-ES", documentType: "DNI", documentNumber: "12345678Z",
        address: "Calle Proxus 1, Madrid", paymentMethod: "grade",
      }))
      yield* service.execute(creatorAccount, new SignContract({}))
      workspace = yield* service.execute(creatorAccount, new RegisterSocialAccount({ tiktokHandle: "@clara.nueva", instagramHandle: "@clara.ig" }))
      expect(current(workspace).data).toMatchObject({ _tag: "OnboardingData", profile: { tiktokHandle: "@clara.nueva" } })
      yield* service.execute(managerAccount, new StartTrial({ creatorId }))

      setNow("2026-08-25T12:00:00.000Z")
      workspace = yield* service.execute(creatorAccount, new SubmitVideo({ campaignId: null, format: "testimonial", reference: "trial-01", tiktokUrl: "https://tiktok.test/trial", instagramUrl: "https://instagram.test/trial" }))
      expect(workspace.videos).toHaveLength(1)
      yield* service.execute(managerAccount, new ReviewVideo({ videoId: required(workspace.videos[0], "the trial video").id, outcome: "accepted", notes: null }))
      setNow("2026-09-02T12:00:00.000Z")
      yield* service.execute(managerAccount, new EvaluateTrial({ creatorId, outcome: "passed", tierId: "tier-1", reason: null }))

      yield* service.execute(adminAccount, new CreateCampaign({
        name: "Otoño España", startsAt: "2026-09-10T00:00:00.000Z", submissionsCloseAt: "2026-09-18T00:00:00.000Z",
        reconciliationEndsAt: "2026-09-25T00:00:00.000Z", countries: ["ES"], formats: ["testimonial"],
        tiers: [{ id: "tier-1", label: "Tier 1", videoTarget: 8, fixedAmountCents: 40_000 }],
        bonusRules: [{ _tag: "views", threshold: 10_000, amountCents: 5_000 }, { _tag: "topN", positions: 1, amountCents: 3_000 }],
      }), true)
      workspace = yield* service.workspace(adminAccount, true)
      const campaignId = required(workspace.campaigns[0], "the campaign").id
      yield* service.execute(adminAccount, new CreateGroup({ campaignId, managerId: manager.id, name: "Grupo Marta", capacity: 25 }), true)
      workspace = yield* service.workspace(adminAccount, true)
      const groupId = required(workspace.groups[0], "the campaign group").id
      yield* service.execute(managerAccount, new AssignCreatorToGroup({ creatorId, groupId, tierId: "tier-1" }))
      yield* service.execute(creatorAccount, new SignContract({}))
      workspace = yield* service.execute(adminAccount, new PublishCampaign({ campaignId }), true)
      expect(workspace.groups[0]?.status).toBe("active")

      setNow("2026-09-11T12:00:00.000Z")
      workspace = yield* service.execute(creatorAccount, new SubmitVideo({ campaignId, format: "testimonial", reference: "campaign-01", tiktokUrl: "https://tiktok.test/campaign", instagramUrl: "https://instagram.test/campaign" }))
      const campaignVideo = required(workspace.videos.find((video) => video.campaignId === campaignId), "the campaign video")
      yield* service.execute(managerAccount, new ReviewVideo({ videoId: campaignVideo.id, outcome: "accepted", notes: null }))
      yield* service.execute(managerAccount, new RefreshVideoMetrics({ videoId: campaignVideo.id }))

      setNow("2026-09-26T12:00:00.000Z")
      yield* service.execute(managerAccount, new FinalizeCampaign({ campaignId }))
      workspace = yield* service.execute(adminAccount, new GeneratePayments({ campaignId }), true)
      const creatorCampaignPayment = required(workspace.payments.find((payment) => payment.kind === "creator_campaign"), "the generated creator campaign payment")
      expect(creatorCampaignPayment).toMatchObject({ status: "pending", amountCents: 48_000 })
      expect(workspace.payments.some((payment) => payment.kind === "trial_compensation" && payment.amountCents === 7_200)).toBe(true)
      expect(workspace.payments.some((payment) => payment.kind === "manager_campaign_commission" && payment.amountCents === 2_400)).toBe(true)
      const paymentId = creatorCampaignPayment.id
      workspace = yield* service.execute(adminAccount, new AdjustPayment({ paymentId, amountCents: -2_000, reason: "Ajuste validado" }), true)
      expect(workspace.payments.find((payment) => payment.id === paymentId)?.amountCents).toBe(46_000)
      workspace = yield* service.execute(adminAccount, new MarkPaymentPaid({ paymentId }), true)
      expect(workspace.payments.find((payment) => payment.id === paymentId)?.status).toBe("paid")
      expect(workspace.campaigns[0]?.status).toBe("finalized")
      expect(workspace.groups[0]?.status).toBe("completed")
    })),
  ))

  test("claims outbound leads and disqualifies a creator after the second missed meeting", () => Effect.runPromise(
    withService({ ...emptyUgcMemoryState, users: [manager] }, (service) => Effect.gen(function*() {
      let workspace = yield* service.execute(managerAccount, new CreateOutboundLead({
        displayName: "Lucía Lead", email: "lucia@proxus.test", countryCode: "ES", notes: "Contacto TikTok",
      }))
      expect(workspace.users.some((user) => user.status === "lead")).toBe(true)
      workspace = yield* service.execute(creatorAccount, new SubmitApplication({
        displayName: "Lucía Lead", email: "lucia@proxus.test", countryCode: "ES", tiktokHandle: "@lucia", instagramHandle: null, phone: null,
      }))
      const creatorId = current(workspace).id
      expect(current(workspace).data).toMatchObject({ _tag: "ApplicantData", source: "outbound" })
      yield* service.execute(managerAccount, new AcceptApplication({ creatorId }))
      yield* service.execute(creatorAccount, new CompleteRequirement({ requirementId: "training" }))
      for (const startsAt of ["2026-08-23T10:00:00.000Z", "2026-08-24T10:00:00.000Z"]) {
        workspace = yield* service.execute(managerAccount, new CreateMeetSlot({ startsAt, durationMinutes: 30 }))
        const available = required(workspace.meets.find((meet) => meet.status === "available"), "an available meeting")
        yield* service.execute(creatorAccount, new ReserveMeet({ meetId: available.id }))
        workspace = yield* service.execute(managerAccount, new RecordMeetAttendance({ meetId: available.id, outcome: "missed", notes: null }))
      }
      expect(workspace.users.find((user) => user.id === creatorId)?.status).toBe("disqualified")
    })),
  ))

  test("pays a completed trial, rewards its outbound origin manager and leaves an incomplete trial unpaid", () => Effect.runPromise(Effect.gen(function*() {
    const outboundCreatorId = makeUgcUserId("20000000-0000-4000-8000-000000000020")
    const trialCreator = new UgcUser({
      id: outboundCreatorId, authUserId: creatorAccount, userType: "creator", status: "trial", displayName: "Outbound Trial", email: "outbound.trial@proxus.test", countryCode: "ES",
      data: { _tag: "TrialData", startedAt: "2026-08-01T00:00:00.000Z", publishingStartsAt: "2026-08-02T00:00:00.000Z", publishingEndsAt: "2026-08-21T00:00:00.000Z", requiredVideoCount: 1, completionCompensationCents: 7_200, currency: "EUR", maxVideosPerDay: 2, minVideosPerWeek: 1, allowedFormats: ["testimonial"], requiredPlatforms: ["tiktok", "instagram"], outboundTrialPassBonusCents: 2_000, contract: signedLegacyContract, contracts: [signedLegacyContract], profile: { tiktokHandle: "@outbound", instagramHandle: "@outbound", phone: null }, acquisition: { source: "outbound", outboundManagerId: manager.id } },
      version: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z",
    })
    const attended = new UgcMeet({ id: makeUgcMeetId("20000000-0000-4000-8000-000000000021"), managerId: manager.id, creatorId: outboundCreatorId, status: "attended", startsAt: "2026-08-01T00:00:00.000Z", durationMinutes: 30, notes: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" })
    const accepted = new UgcVideo({ id: makeUgcVideoId("20000000-0000-4000-8000-000000000022"), creatorId: outboundCreatorId, campaignId: null, status: "accepted", format: "testimonial", reference: "trial-complete", tiktokUrl: "https://tiktok.test/complete", instagramUrl: "https://instagram.test/complete", submittedAt: "2026-08-10T00:00:00.000Z", reviewedAt: "2026-08-11T00:00:00.000Z", reviewNotes: null, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" })
    const completed = yield* withService({ ...emptyUgcMemoryState, users: [manager, trialCreator], meets: [attended], videos: [accepted] }, (service) => service.execute(managerAccount, new EvaluateTrial({ creatorId: outboundCreatorId, outcome: "passed", tierId: "tier-1", reason: null })))
    expect(completed.payments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "trial_compensation", recipientUserId: outboundCreatorId, amountCents: 7_200 }),
      expect.objectContaining({ kind: "manager_outbound_conversion", recipientUserId: manager.id, relatedCreatorId: outboundCreatorId, amountCents: 2_000 }),
    ]))

    const incomplete = yield* withService({ ...emptyUgcMemoryState, users: [manager, trialCreator], meets: [attended] }, (service) => service.execute(managerAccount, new EvaluateTrial({ creatorId: outboundCreatorId, outcome: "incomplete", tierId: null, reason: "No completó el objetivo" })))
    expect(incomplete.payments).toEqual([])
    expect(incomplete.users.find((user) => user.id === outboundCreatorId)?.status).toBe("disqualified")
  })))

  test("renews a creator into a campaign without signing when material terms are unchanged", () => Effect.runPromise(
    withService({ ...emptyUgcMemoryState, users: [manager, approvedCreator("20000000-0000-4000-8000-000000000030", creatorAccount, "Renovación") ] }, (service) => Effect.gen(function*() {
      yield* service.execute(adminAccount, new CreateCampaign({
        name: "Mismas condiciones", startsAt: "2026-09-01T00:00:00.000Z", submissionsCloseAt: "2026-09-10T00:00:00.000Z", reconciliationEndsAt: "2026-09-17T00:00:00.000Z",
        countries: ["ES"], formats: ["testimonial"], tiers: [{ id: "tier-1", label: "Tier 1", videoTarget: 1, fixedAmountCents: 1_000 }], bonusRules: [],
      }), true)
      let workspace = yield* service.workspace(adminAccount, true)
      const campaign = required(workspace.campaigns[0], "the unchanged campaign")
      yield* service.execute(adminAccount, new CreateGroup({ campaignId: campaign.id, managerId: manager.id, name: "Renovación", capacity: 5 }), true)
      workspace = yield* service.workspace(adminAccount, true)
      const group = required(workspace.groups[0], "the renewal group")
      const creator = required(workspace.users.find((user) => user.authUserId === creatorAccount), "the renewal creator")
      workspace = yield* service.execute(managerAccount, new AssignCreatorToGroup({ creatorId: creator.id, groupId: group.id, tierId: "tier-1" }))
      expect(workspace.memberships[0]?.status).toBe("scheduled")
      expect(workspace.users.find((user) => user.id === creator.id)?.data).toMatchObject({ _tag: "CreatorData", contracts: [signedLegacyContract] })
    })),
  ))

  test("enforces manager markets, group ownership, capacity and non-overlapping campaign assignments", () => Effect.runPromise(
    withService({
      ...emptyUgcMemoryState,
      users: [
        manager,
        approvedCreator("20000000-0000-4000-8000-000000000010", creatorAccount, "Cora Uno"),
        approvedCreator("20000000-0000-4000-8000-000000000011", account(4), "Cora Dos"),
      ],
    }, (service) => Effect.gen(function*() {
      const outsideMarket = yield* Effect.flip(service.execute(managerAccount, new CreateOutboundLead({
        displayName: "México fuera", email: "outside@proxus.test", countryCode: "AR", notes: null,
      })))
      expect(outsideMarket._tag).toBe("Forbidden")

      let workspace = yield* service.execute(adminAccount, new ConfigureManager({
        authUserId: account(9), displayName: "Manager España 2", email: "manager2@proxus.test", countryCode: "ES", markets: ["ES"], acceptsMeetings: false,
      }), true)
      const secondManager = required(workspace.users.find((user) => user.authUserId === account(9)), "the second manager")

      const createCampaign = (name: string, startsAt: string, submissionsCloseAt: string, reconciliationEndsAt: string) => service.execute(adminAccount, new CreateCampaign({
        name, startsAt, submissionsCloseAt, reconciliationEndsAt, countries: ["ES"], formats: ["testimonial"],
        tiers: [{ id: "tier-1", label: "Tier 1", videoTarget: 8, fixedAmountCents: 40_000 }], bonusRules: [],
      }), true)
      yield* createCampaign("Principal", "2026-09-01T00:00:00.000Z", "2026-09-10T00:00:00.000Z", "2026-09-17T00:00:00.000Z")
      yield* createCampaign("Solapada", "2026-09-09T00:00:00.000Z", "2026-09-18T00:00:00.000Z", "2026-09-25T00:00:00.000Z")
      yield* createCampaign("Futura", "2026-10-01T00:00:00.000Z", "2026-10-10T00:00:00.000Z", "2026-10-17T00:00:00.000Z")
      workspace = yield* service.workspace(adminAccount, true)
      const principal = required(workspace.campaigns.find((campaign) => campaign.name === "Principal"), "the principal campaign")
      const overlapping = required(workspace.campaigns.find((campaign) => campaign.name === "Solapada"), "the overlapping campaign")
      const future = required(workspace.campaigns.find((campaign) => campaign.name === "Futura"), "the future campaign")
      yield* service.execute(adminAccount, new CreateGroup({ campaignId: principal.id, managerId: manager.id, name: "Principal", capacity: 1 }), true)
      yield* service.execute(adminAccount, new CreateGroup({ campaignId: overlapping.id, managerId: manager.id, name: "Solapada", capacity: 2 }), true)
      yield* service.execute(adminAccount, new CreateGroup({ campaignId: future.id, managerId: secondManager.id, name: "Futura", capacity: 2 }), true)
      workspace = yield* service.workspace(adminAccount, true)
      const principalGroup = required(workspace.groups.find((group) => group.name === "Principal"), "the principal group")
      const overlappingGroup = required(workspace.groups.find((group) => group.name === "Solapada"), "the overlapping group")
      const futureGroup = required(workspace.groups.find((group) => group.name === "Futura"), "the future group")
      const firstCreator = required(workspace.users.find((user) => user.authUserId === creatorAccount), "the first creator")
      const secondCreator = required(workspace.users.find((user) => user.authUserId === account(4)), "the second creator")

      yield* service.execute(managerAccount, new AssignCreatorToGroup({ creatorId: firstCreator.id, groupId: principalGroup.id, tierId: "tier-1" }))
      const atCapacity = yield* Effect.flip(service.execute(managerAccount, new AssignCreatorToGroup({ creatorId: secondCreator.id, groupId: principalGroup.id, tierId: "tier-1" })))
      expect(atCapacity._tag).toBe("UgcConflict")
      const overlap = yield* Effect.flip(service.execute(managerAccount, new AssignCreatorToGroup({ creatorId: firstCreator.id, groupId: overlappingGroup.id, tierId: "tier-1" })))
      expect(overlap._tag).toBe("UgcConflict")
      const ownership = yield* Effect.flip(service.execute(managerAccount, new AssignCreatorToGroup({ creatorId: firstCreator.id, groupId: futureGroup.id, tierId: "tier-1" })))
      expect(ownership._tag).toBe("Forbidden")

      yield* service.execute(account(9), new AssignCreatorToGroup({ creatorId: firstCreator.id, groupId: futureGroup.id, tierId: "tier-1" }))
      workspace = yield* service.workspace(adminAccount, true)
      expect(workspace.memberships.filter((membership) => membership.creatorId === firstCreator.id)).toHaveLength(2)

      workspace = yield* service.execute(adminAccount, new DisableManager({ managerId: secondManager.id }), true)
      expect(workspace.users.find((user) => user.id === secondManager.id)?.status).toBe("disabled")
    })),
  ))

  test("restricts terminal creator actions and restores suspended creator data", () => Effect.runPromise(
    withService({
      ...emptyUgcMemoryState,
      users: [manager, new UgcUser({
        id: makeUgcUserId("20000000-0000-4000-8000-000000000002"), authUserId: creatorAccount, userType: "creator", status: "creator",
        displayName: "Cora", email: "cora@proxus.test", countryCode: "ES",
        data: { _tag: "CreatorData", approvedAt: "2026-08-01T00:00:00.000Z", tierId: "gold", profile: { tiktokHandle: "@cora", instagramHandle: null, phone: null }, contracts: [], acquisition: { source: "inbound", outboundManagerId: null } },
        version: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      })],
    }, (service) => Effect.gen(function*() {
      const creatorId = makeUgcUserId("20000000-0000-4000-8000-000000000002")
      yield* service.execute(adminAccount, new SuspendCreator({ creatorId, reason: "Pausa acordada" }), true)
      let workspace = yield* service.execute(adminAccount, new ResumeCreator({ creatorId }), true)
      expect(workspace.users.find((user) => user.id === creatorId)?.data).toMatchObject({ _tag: "CreatorData", tierId: "gold" })
      workspace = yield* service.execute(adminAccount, new ExitCreator({ creatorId, reason: "Baja voluntaria" }), true)
      expect(workspace.users.find((user) => user.id === creatorId)?.status).toBe("exited")
    })),
  ))

  test("imports group configuration into an empty draft without copying members", () => Effect.runPromise(
    withService({ ...emptyUgcMemoryState, users: [manager] }, (service) => Effect.gen(function*() {
      const create = (name: string, startsAt: string) => service.execute(adminAccount, new CreateCampaign({
        name,
        startsAt,
        submissionsCloseAt: startsAt === "2026-09-01T00:00:00.000Z" ? "2026-09-10T00:00:00.000Z" : "2026-10-10T00:00:00.000Z",
        reconciliationEndsAt: startsAt === "2026-09-01T00:00:00.000Z" ? "2026-09-17T00:00:00.000Z" : "2026-10-17T00:00:00.000Z",
        countries: ["ES"], formats: ["testimonial"],
        tiers: [{ id: "tier-1", label: "Tier 1", videoTarget: 8, fixedAmountCents: 40_000 }], bonusRules: [],
      }), true)
      yield* create("Origen", "2026-09-01T00:00:00.000Z")
      yield* create("Destino", "2026-10-01T00:00:00.000Z")
      let workspace = yield* service.workspace(adminAccount, true)
      const source = required(workspace.campaigns.find((campaign) => campaign.name === "Origen"), "the source campaign")
      const target = required(workspace.campaigns.find((campaign) => campaign.name === "Destino"), "the target campaign")
      yield* service.execute(adminAccount, new CreateGroup({ campaignId: source.id, managerId: manager.id, name: "Equipo importable", capacity: 17 }), true)
      workspace = yield* service.execute(adminAccount, new ImportGroupConfiguration({ sourceCampaignId: source.id, targetCampaignId: target.id }), true)
      expect(workspace.groups.find((group) => group.campaignId === target.id)).toMatchObject({ name: "Equipo importable", capacity: 17, managerId: manager.id, status: "draft" })
      expect(workspace.memberships).toHaveLength(0)
    })),
  ))

  test("rejects applicants without exposing them to unrelated managers", () => Effect.runPromise(
    withService({ ...emptyUgcMemoryState, users: [manager] }, (service) => Effect.gen(function*() {
      const application = yield* service.execute(creatorAccount, new SubmitApplication({
        displayName: "Rechazada", email: "reject@proxus.test", countryCode: "ES", tiktokHandle: null, instagramHandle: null, phone: null,
      }))
      const creatorId = current(application).id
      const workspace = yield* service.execute(managerAccount, new RejectApplication({ creatorId, reason: "No encaja" }))
      expect(workspace.users.find((user) => user.id === creatorId)?.status).toBe("rejected")
    })),
  ))
})
