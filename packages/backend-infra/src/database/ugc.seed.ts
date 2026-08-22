import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect } from "effect"
import { ugcCampaigns, ugcGroupMembers, ugcGroups, ugcMeets, ugcPayments, ugcUsers, ugcVideoData, ugcVideos } from "./schema.js"

type SeedDatabase = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>
const at = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))
const managerId = "50000000-0000-4000-8000-000000000001"
const creatorId = "50000000-0000-4000-8000-000000000002"
const currentCampaignId = "50000000-0000-4000-8000-000000000003"
const pastCampaignId = "50000000-0000-4000-8000-000000000004"
const currentGroupId = "50000000-0000-4000-8000-000000000005"
const pastGroupId = "50000000-0000-4000-8000-000000000006"
const currentVideoId = "50000000-0000-4000-8000-000000000009"
const pastVideoId = "50000000-0000-4000-8000-000000000010"

/** Idempotent synthetic UGC data for local development and isolated PR previews. */
export const seedUgcPreviewFixtures = (db: SeedDatabase) => Effect.gen(function*() {
  yield* db.insert(ugcUsers).values([
    { id: managerId, authUserId: "40000000-0000-4000-8000-000000000002", userType: "manager", status: "active", displayName: "Marta Manager", email: "editor.qa@proxus.dev", countryCode: "ES", data: { _tag: "ManagerData", markets: ["ES", "MX"], acceptsMeetings: true, notes: "Fixture de preview" }, dataVersion: 1, version: 1, createdAt: at("2026-07-20T00:00:00.000Z"), updatedAt: at("2026-08-20T00:00:00.000Z") },
    { id: creatorId, authUserId: "40000000-0000-4000-8000-000000000003", userType: "creator", status: "creator", displayName: "Lucía Creator", email: "student.email.qa@proxus.dev", countryCode: "ES", data: { _tag: "CreatorData", approvedAt: "2026-07-20T00:00:00.000Z", tierId: "tier-1", profile: { tiktokHandle: "@lucia.proxus", instagramHandle: "@lucia.proxus", phone: "+34600000000" } }, dataVersion: 1, version: 1, createdAt: at("2026-07-20T00:00:00.000Z"), updatedAt: at("2026-08-20T00:00:00.000Z") },
  ]).onConflictDoNothing()
  const data = { countries: ["ES"], formats: ["testimonial", "review", "routine"], tiers: [{ id: "tier-1", label: "Tier 1", videoTarget: 8, fixedAmountCents: 40_000 }], bonusRules: [{ _tag: "views", threshold: 10_000, amountCents: 5_000 }], currency: "EUR" }
  yield* db.insert(ugcCampaigns).values([
    { id: currentCampaignId, name: "GlowUp España", status: "published", startsAt: at("2026-08-20T00:00:00.000Z"), submissionsCloseAt: at("2026-08-30T23:59:59.000Z"), reconciliationEndsAt: at("2026-09-06T23:59:59.000Z"), data, dataVersion: 1, version: 1, createdAt: at("2026-08-01T00:00:00.000Z"), updatedAt: at("2026-08-20T00:00:00.000Z") },
    { id: pastCampaignId, name: "Summer Skin", status: "finalized", startsAt: at("2026-07-01T00:00:00.000Z"), submissionsCloseAt: at("2026-07-10T23:59:59.000Z"), reconciliationEndsAt: at("2026-07-17T23:59:59.000Z"), data, dataVersion: 1, version: 2, createdAt: at("2026-06-20T00:00:00.000Z"), updatedAt: at("2026-07-18T00:00:00.000Z") },
  ]).onConflictDoNothing()
  yield* db.insert(ugcGroups).values([
    { id: currentGroupId, campaignId: currentCampaignId, managerId, name: "Equipo Violeta", status: "active", capacity: 25, createdAt: at("2026-08-01T00:00:00.000Z"), updatedAt: at("2026-08-20T00:00:00.000Z") },
    { id: pastGroupId, campaignId: pastCampaignId, managerId, name: "Equipo Verano", status: "completed", capacity: 25, createdAt: at("2026-06-20T00:00:00.000Z"), updatedAt: at("2026-07-18T00:00:00.000Z") },
  ]).onConflictDoNothing()
  yield* db.insert(ugcGroupMembers).values([
    { id: "50000000-0000-4000-8000-000000000007", groupId: currentGroupId, creatorId, tierId: "tier-1", status: "active", joinedAt: at("2026-08-10T00:00:00.000Z"), completedAt: null },
    { id: "50000000-0000-4000-8000-000000000008", groupId: pastGroupId, creatorId, tierId: "tier-1", status: "completed", joinedAt: at("2026-06-25T00:00:00.000Z"), completedAt: at("2026-07-18T00:00:00.000Z") },
  ]).onConflictDoNothing()
  yield* db.insert(ugcMeets).values({ id: "50000000-0000-4000-8000-000000000011", managerId, creatorId: null, status: "available", startsAt: at("2026-08-25T10:00:00.000Z"), durationMinutes: 30, notes: null, createdAt: at("2026-08-20T00:00:00.000Z"), updatedAt: at("2026-08-20T00:00:00.000Z") }).onConflictDoNothing()
  yield* db.insert(ugcVideos).values([
    { id: currentVideoId, creatorId, campaignId: currentCampaignId, status: "submitted", format: "testimonial", reference: "GLW-01", tiktokUrl: "https://www.tiktok.com/@lucia.proxus/video/1", instagramUrl: "https://www.instagram.com/reel/glw1", submittedAt: at("2026-08-21T12:00:00.000Z"), reviewedAt: null, reviewNotes: null, createdAt: at("2026-08-21T12:00:00.000Z"), updatedAt: at("2026-08-21T12:00:00.000Z") },
    { id: pastVideoId, creatorId, campaignId: pastCampaignId, status: "accepted", format: "review", reference: "SUM-08", tiktokUrl: "https://www.tiktok.com/@lucia.proxus/video/8", instagramUrl: null, submittedAt: at("2026-07-09T12:00:00.000Z"), reviewedAt: at("2026-07-11T12:00:00.000Z"), reviewNotes: null, createdAt: at("2026-07-09T12:00:00.000Z"), updatedAt: at("2026-07-11T12:00:00.000Z") },
  ]).onConflictDoNothing()
  yield* db.insert(ugcVideoData).values([
    { id: "50000000-0000-4000-8000-000000000012", videoId: currentVideoId, tiktokViews: 12_800, instagramViews: 5_600, capturedAt: at("2026-08-22T08:00:00.000Z"), source: "mock" },
    { id: "50000000-0000-4000-8000-000000000013", videoId: pastVideoId, tiktokViews: 31_400, instagramViews: 0, capturedAt: at("2026-07-17T08:00:00.000Z"), source: "mock" },
  ]).onConflictDoNothing()
  yield* db.insert(ugcPayments).values({ id: "50000000-0000-4000-8000-000000000014", creatorId, campaignId: pastCampaignId, status: "paid", amountCents: 45_000, breakdown: { fixedAmountCents: 40_000, viewsBonusCents: 5_000, rankingBonusCents: 0, referralBonusCents: 0, manualAdjustmentCents: 0, adjustmentReason: null }, paidAt: at("2026-07-22T12:00:00.000Z"), createdAt: at("2026-07-18T12:00:00.000Z"), updatedAt: at("2026-07-22T12:00:00.000Z") }).onConflictDoNothing()
})
