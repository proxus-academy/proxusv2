import { UgcCampaign, UgcPayment, UgcUser, makeUgcCampaignId, makeUgcPaymentId, makeUgcUserId } from "@proxus/shared/ugc-management"
import { describe, expect, test } from "vitest"
import { pendingPaymentsCsv } from "./payments-csv.js"

const at = "2026-08-22T12:00:00.000Z"
const creatorId = makeUgcUserId("70000000-0000-4000-8000-000000000001")
const campaignId = makeUgcCampaignId("70000000-0000-4000-8000-000000000002")
const creator = new UgcUser({ id: creatorId, authUserId: null, userType: "creator", status: "creator", displayName: "Lucía, Creator", email: "lucia@proxus.test", countryCode: "ES", data: { _tag: "CreatorData", approvedAt: at, tierId: "base", profile: { tiktokHandle: null, instagramHandle: null, phone: null } }, version: 1, createdAt: at, updatedAt: at })
const campaign = new UgcCampaign({ id: campaignId, name: "Campaña", status: "finalized", startsAt: "2026-08-01T00:00:00.000Z", submissionsCloseAt: "2026-08-10T00:00:00.000Z", reconciliationEndsAt: "2026-08-17T00:00:00.000Z", data: { countries: ["ES"], formats: ["review"], tiers: [{ id: "base", label: "Base", videoTarget: 8, fixedAmountCents: 10_000 }], bonusRules: [], currency: "EUR" }, version: 2, createdAt: at, updatedAt: at })
const payment = (status: "pending" | "paid", suffix: number) => new UgcPayment({ id: makeUgcPaymentId(`70000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`), creatorId, campaignId, status, amountCents: 10_000, breakdown: { fixedAmountCents: 10_000, viewsBonusCents: 0, rankingBonusCents: 0, referralBonusCents: 0, manualAdjustmentCents: 0, adjustmentReason: null }, paidAt: status === "paid" ? at : null, createdAt: at, updatedAt: at })

describe("pendingPaymentsCsv", () => {
  test("exports only pending payments and escapes cells", () => {
    const csv = pendingPaymentsCsv([payment("pending", 3), payment("paid", 4)], [creator], [campaign])
    expect(csv).toContain('"Lucía, Creator"')
    expect(csv).toContain('"10000"')
    expect(csv).not.toContain(makeUgcPaymentId("70000000-0000-4000-8000-000000000004"))
  })
})
