import { PgliteClient } from "@effect/sql-pglite"
import { UgcRepository } from "@proxus/backend-domain/ugc-management"
import {
  UgcCampaign,
  UgcGroup,
  UgcGroupMember,
  UgcMeet,
  UgcPayment,
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
} from "@proxus/shared/ugc-management"
import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { migratePglite } from "../../database/pglite.js"
import { UgcRepositoryPgliteLive } from "./repository.pglite.layer.js"

const now = "2026-08-22T12:00:00.000Z"
const id = (suffix: number) => `30000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`
const managerId = makeUgcUserId(id(1))
const creatorId = makeUgcUserId(id(2))
const campaignId = makeUgcCampaignId(id(3))
const groupId = makeUgcGroupId(id(4))

const manager = new UgcUser({
  id: managerId, authUserId: null, userType: "manager", status: "active", displayName: "Manager", email: "manager@ugc.test", countryCode: "ES",
  data: { _tag: "ManagerData", markets: ["ES"], acceptsMeetings: true, notes: null }, version: 1, createdAt: now, updatedAt: now,
})
const creator = new UgcUser({
  id: creatorId, authUserId: null, userType: "creator", status: "creator", displayName: "Creator", email: "creator@ugc.test", countryCode: "ES",
  data: { _tag: "CreatorData", approvedAt: now, tierId: "base", profile: { tiktokHandle: "@creator", instagramHandle: null, phone: null } }, version: 1, createdAt: now, updatedAt: now,
})
const campaign = new UgcCampaign({
  id: campaignId, name: "Campaign", status: "published", startsAt: now, submissionsCloseAt: "2026-08-30T12:00:00.000Z",
  reconciliationEndsAt: "2026-09-06T12:00:00.000Z", data: { countries: ["ES"], formats: ["testimonial"], tiers: [{ id: "base", label: "Base", videoTarget: 8, fixedAmountCents: 10_000 }], bonusRules: [], currency: "EUR" },
  version: 1, createdAt: now, updatedAt: now,
})

const withRepository = <A, E>(effect: Effect.Effect<A, E, UgcRepository>) => {
  const client = PgliteClient.layer()
  const repository = UgcRepositoryPgliteLive.pipe(Layer.provide(client))
  return Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(Layer.merge(client, repository))
    return yield* Effect.gen(function*() {
      yield* migratePglite("./drizzle")
      return yield* effect
    }).pipe(Effect.provide(context))
  }))
}

describe("UgcRepository Drizzle contract", () => {
  test("round-trips every persisted UGC entity and detects stale aggregate writes", () => Effect.runPromise(
    withRepository(Effect.gen(function*() {
      const repository = yield* UgcRepository
      yield* repository.users.insert(manager)
      yield* repository.users.insert(creator)
      yield* repository.campaigns.insert(campaign)
      const group = new UgcGroup({ id: groupId, campaignId, managerId, name: "Group 1", status: "active", capacity: 25, createdAt: now, updatedAt: now })
      yield* repository.groups.insert(group)
      yield* repository.memberships.insert(new UgcGroupMember({ id: makeUgcGroupMemberId(id(5)), groupId, creatorId, tierId: "base", status: "active", joinedAt: now, completedAt: null }))
      yield* repository.meets.insert(new UgcMeet({ id: makeUgcMeetId(id(6)), managerId, creatorId, status: "attended", startsAt: now, durationMinutes: 30, notes: null, createdAt: now, updatedAt: now }))
      const videoId = makeUgcVideoId(id(7))
      yield* repository.videos.insert(new UgcVideo({ id: videoId, creatorId, campaignId, status: "accepted", format: "testimonial", reference: "campaign-01", tiktokUrl: "https://tiktok.test/video", instagramUrl: null, submittedAt: now, reviewedAt: now, reviewNotes: null, createdAt: now, updatedAt: now }))
      yield* repository.videoData.insert(new UgcVideoData({ id: makeUgcVideoDataId(id(8)), videoId, tiktokViews: 12_000, instagramViews: 0, capturedAt: now, source: "mock" }))
      yield* repository.payments.insert(new UgcPayment({ id: makeUgcPaymentId(id(9)), creatorId, campaignId, status: "pending", amountCents: 10_000, breakdown: { fixedAmountCents: 10_000, viewsBonusCents: 0, rankingBonusCents: 0, referralBonusCents: 0, manualAdjustmentCents: 0, adjustmentReason: null }, paidAt: null, createdAt: now, updatedAt: now }))

      expect(yield* repository.users.list()).toHaveLength(2)
      expect(yield* repository.campaigns.list()).toEqual([campaign])
      expect(yield* repository.groups.list()).toEqual([group])
      expect(yield* repository.memberships.list()).toHaveLength(1)
      expect(yield* repository.meets.list()).toHaveLength(1)
      expect(yield* repository.videos.list()).toHaveLength(1)
      expect(yield* repository.videoData.list()).toHaveLength(1)
      expect(yield* repository.payments.list()).toHaveLength(1)

      const stale = yield* Effect.flip(repository.users.update(new UgcUser({ ...creator, version: 2, updatedAt: "2026-08-22T13:00:00.000Z" }), 99))
      expect(stale).toMatchObject({ _tag: "UgcOptimisticConflict", entity: "ugc_user" })
    })),
  ), 15_000)

  test("rejects reserved meetings without a creator at the database boundary", () => Effect.runPromise(
    withRepository(Effect.gen(function*() {
      const repository = yield* UgcRepository
      yield* repository.users.insert(manager)
      const result = yield* Effect.exit(repository.meets.insert(new UgcMeet({
        id: makeUgcMeetId(id(10)), managerId, creatorId: null, status: "reserved", startsAt: now, durationMinutes: 30, notes: null,
        createdAt: now, updatedAt: now,
      })))
      expect(result._tag).toBe("Failure")
    })),
  ), 15_000)

  test("rolls back every write when a multi-entity command fails", () => Effect.runPromise(
    withRepository(Effect.gen(function*() {
      const repository = yield* UgcRepository
      const result = yield* Effect.exit(repository.transaction((transaction) => transaction.users.insert(manager).pipe(
        Effect.andThen(Effect.fail("abort command")),
      )))
      expect(result._tag).toBe("Failure")
      expect(yield* repository.users.list()).toEqual([])
    })),
  ), 15_000)
})
