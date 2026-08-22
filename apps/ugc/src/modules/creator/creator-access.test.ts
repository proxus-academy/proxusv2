import { UgcUser, UgcWorkspace, makeUgcUserId } from "@proxus/shared/ugc-management"
import { describe, expect, test } from "vitest"
import { canAccessCreatorLibrary } from "./creator-access.js"

const asOf = "2026-08-22T12:00:00.000Z"
const creatorId = makeUgcUserId("72000000-0000-4000-8000-000000000001")
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
})
const trial = (publishingStartsAt: string) => user("trial", {
  _tag: "TrialData",
  startedAt: "2026-08-20T12:00:00.000Z",
  publishingStartsAt,
  publishingEndsAt: "2026-08-30T12:00:00.000Z",
  requiredVideoCount: 8,
  contract: {
    generatedAt: asOf,
    signedAt: asOf,
    locale: "es-ES",
    documentType: "DNI",
    documentNumber: "12345678A",
    address: "Madrid",
    paymentMethod: "grade",
    renderedDocument: "Contrato",
  },
  profile: { tiktokHandle: "@lucia", instagramHandle: "@lucia", phone: null },
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
    })))).toBe(true)
  })

  test("locks terminal creator states", () => {
    expect(canAccessCreatorLibrary(workspace(user("suspended", {
      _tag: "TerminalData",
      reason: "Cuenta en revisión",
      decidedAt: asOf,
      decidedBy: creatorId,
      previousStatus: "creator",
      previousCreatorData: null,
    })))).toBe(false)
  })
})
