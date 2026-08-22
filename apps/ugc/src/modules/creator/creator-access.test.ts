import { UgcUser, UgcWorkspace, makeUgcUserId } from "@proxus/shared/ugc-management"
import { describe, expect, test } from "vitest"
import { canAccessCreatorLibrary, canAccessCreatorProfile } from "./creator-access.js"

const asOf = "2026-08-22T12:00:00.000Z"
const creatorId = makeUgcUserId("72000000-0000-4000-8000-000000000001")
const contractPolicy = { contentRetentionMonths: 3, creatorNoticeDays: 5, paidMediaRightsAmountCents: 3_000, paidMediaRightsDurationMonths: 3, exclusivityRequired: true } as const
const terms = { contentTarget: 8, compensationCents: 7_200, currency: "EUR", formats: ["testimonial"], requiredPlatforms: ["tiktok", "instagram"], bonusRules: [], maxVideosPerDay: 2, minVideosPerWeek: 1, contractPolicy } as const
const user = (status: UgcUser["status"], data: UgcUser["data"]) => new UgcUser({
  id: creatorId,
  authUserId: null,
  userType: "creator",
  status,
  displayName: "Lucía",
  email: "lucia@proxus.test",
  countryCode: "ES",
  data,
  version: 1,
  createdAt: asOf,
  updatedAt: asOf,
})
const workspace = (currentUser: UgcUser) => new UgcWorkspace({
  asOf,
  role: "creator",
  currentUser,
  users: [currentUser],
  campaigns: [],
  groups: [],
  memberships: [],
  meets: [],
  videos: [],
  videoData: [],
  payments: [],
  programConfigurations: [],
})
const trial = (publishingStartsAt: string) => user("trial", {
  _tag: "TrialData",
  startedAt: "2026-08-20T12:00:00.000Z",
  publishingStartsAt,
  publishingEndsAt: "2026-08-30T12:00:00.000Z",
  requiredVideoCount: 8,
  completionCompensationCents: 7_200,
  currency: "EUR",
  maxVideosPerDay: 2,
  minVideosPerWeek: 1,
  allowedFormats: ["testimonial"],
  requiredPlatforms: ["tiktok", "instagram"],
  outboundTrialPassBonusCents: 2_000,
  contract: {
    generatedAt: asOf,
    signedAt: asOf,
    scope: "trial",
    campaignId: null,
    termsKey: "trial-es-v1",
    terms,
    locale: "es-ES",
    documentType: "DNI",
    documentNumber: "12345678A",
    address: "Madrid",
    paymentMethod: "grade",
    renderedDocument: "Contrato",
  },
  contracts: [],
  profile: { tiktokHandle: "@lucia", instagramHandle: "@lucia", phone: null },
  acquisition: { source: "inbound", outboundManagerId: null },
})

describe("canAccessCreatorLibrary", () => {
  test("keeps navigation locked before the trial publishing window", () => {
    expect(canAccessCreatorLibrary(workspace(trial("2026-08-24T12:00:00.000Z")))).toBe(false)
  })

  test("unlocks navigation when trial publishing starts and keeps it for creators", () => {
    expect(canAccessCreatorLibrary(workspace(trial("2026-08-22T12:00:00.000Z")))).toBe(true)
    expect(canAccessCreatorLibrary(workspace(user("creator", {
      _tag: "CreatorData",
      approvedAt: asOf,
      tierId: "tier-1",
      profile: { tiktokHandle: "@lucia", instagramHandle: "@lucia", phone: null },
      contracts: [],
      acquisition: { source: "inbound", outboundManagerId: null },
    })))).toBe(true)
  })

  test("keeps historical navigation until the configured retention deadline", () => {
    expect(canAccessCreatorLibrary(workspace(user("suspended", {
      _tag: "TerminalData",
      reason: "Cuenta en revisión",
      decidedAt: asOf,
      decidedBy: creatorId,
      previousStatus: "creator",
      previousCreatorData: null,
      historyAvailableUntil: "2026-11-20T12:00:00.000Z",
      profile: null,
      contracts: [],
    })))).toBe(true)
    expect(canAccessCreatorLibrary(workspace(user("exited", {
      _tag: "TerminalData",
      reason: "Colaboración finalizada",
      decidedAt: "2026-05-01T12:00:00.000Z",
      decidedBy: creatorId,
      previousStatus: "creator",
      previousCreatorData: null,
      historyAvailableUntil: "2026-08-01T12:00:00.000Z",
      profile: null,
      contracts: [],
    })))).toBe(false)
  })

  test("does not expose historical tabs to an applicant rejected before trial", () => {
    const rejected = workspace(user("rejected", {
      _tag: "TerminalData",
      reason: "Solicitud no aceptada",
      decidedAt: asOf,
      decidedBy: creatorId,
      previousStatus: "applicant",
      previousCreatorData: null,
      historyAvailableUntil: "2026-11-20T12:00:00.000Z",
      profile: { tiktokHandle: "@lucia", instagramHandle: null, phone: null },
      contracts: [],
    }))
    expect(canAccessCreatorLibrary(rejected)).toBe(false)
    expect(canAccessCreatorProfile(rejected)).toBe(false)
  })
})
