import { RegistryProvider } from "@effect/atom-react"
import { ugcWorkspaceQuery } from "@proxus/frontend-core/ugc-management"
import {
  UgcCampaign,
  UgcGroup,
  UgcGroupMember,
  UgcUser,
  UgcWorkspace,
  makeUgcCampaignId,
  makeUgcGroupId,
  makeUgcGroupMemberId,
  makeUgcUserId,
} from "@proxus/shared/ugc-management"
import { cleanup, render, screen } from "@testing-library/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { afterEach, describe, expect, test } from "vitest"
import { CreatorHomeScreen } from "./home-screen.js"

const creatorId = makeUgcUserId("60000000-0000-4000-8000-000000000001")
const campaignId = makeUgcCampaignId("60000000-0000-4000-8000-000000000002")
const groupId = makeUgcGroupId("60000000-0000-4000-8000-000000000003")
const asOf = "2026-08-22T12:00:00.000Z"

const creator = (status: UgcUser["status"], data: UgcUser["data"]) => new UgcUser({
  id: creatorId, authUserId: null, userType: "creator", status, displayName: "Lucía", email: "lucia@proxus.test", countryCode: "ES", data,
  version: 1, createdAt: asOf, updatedAt: asOf,
})
const workspace = (currentUser: UgcUser | null, extra: Partial<UgcWorkspace> = {}) => new UgcWorkspace({
  asOf, role: currentUser === null ? "none" : "creator", currentUser, users: currentUser === null ? [] : [currentUser], campaigns: [], groups: [], memberships: [], meets: [], videos: [], videoData: [], payments: [], ...extra,
})
const show = (value: UgcWorkspace) => render(<RegistryProvider initialValues={[[ugcWorkspaceQuery, AsyncResult.success(value)]]}><CreatorHomeScreen /></RegistryProvider>)

afterEach(cleanup)

describe("CreatorHomeScreen", () => {
  test("shows the contact application for an authenticated account without UGC profile", () => {
    show(workspace(null))
    expect(screen.getByRole("heading", { name: "Cuéntanos sobre ti" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Enviar solicitud" })).toBeDefined()
  })

  test("shows application review and terminal decisions", () => {
    show(workspace(creator("applicant", { _tag: "ApplicantData", source: "inbound", appliedAt: asOf, profile: { tiktokHandle: null, instagramHandle: null, phone: null } })))
    expect(screen.getByRole("heading", { name: "Ya tenemos tu solicitud" })).toBeDefined()
    cleanup()
    show(workspace(creator("rejected", { _tag: "TerminalData", reason: "No hay campañas compatibles", decidedAt: asOf, decidedBy: creatorId, previousStatus: "applicant", previousCreatorData: null })))
    expect(screen.getByText("No hay campañas compatibles")).toBeDefined()
  })

  test("renders actionable onboarding requirements", () => {
    show(workspace(creator("onboarding", {
      _tag: "OnboardingData", acceptedAt: asOf, acceptedBy: creatorId, profile: { tiktokHandle: null, instagramHandle: null, phone: null }, missedMeetCount: 0, contract: null,
      requirements: [{ id: "profile", label: "Completar perfil", completedAt: asOf }, { id: "training", label: "Conocer Proxus", completedAt: null }, { id: "contract", label: "Firmar contrato", completedAt: null }, { id: "social", label: "Registrar cuenta social", completedAt: null }],
    })))
    expect(screen.getByRole("heading", { name: "Prepara todo para empezar" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Completar" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Guardar cuenta" })).toBeDefined()
  })

  test("uses the home screen for an active campaign and exposes video registration", () => {
    const user = creator("creator", { _tag: "CreatorData", approvedAt: asOf, tierId: "tier-1", profile: { tiktokHandle: "@lucia", instagramHandle: null, phone: null } })
    const campaign = new UgcCampaign({ id: campaignId, name: "GlowUp España", status: "published", startsAt: "2026-08-20T00:00:00.000Z", submissionsCloseAt: "2026-08-30T00:00:00.000Z", reconciliationEndsAt: "2026-09-06T00:00:00.000Z", data: { countries: ["ES"], formats: ["testimonial"], tiers: [{ id: "tier-1", label: "Tier 1", videoTarget: 8, fixedAmountCents: 40_000 }], bonusRules: [], currency: "EUR" }, version: 1, createdAt: asOf, updatedAt: asOf })
    const group = new UgcGroup({ id: groupId, campaignId, managerId: creatorId, name: "Equipo", status: "active", capacity: 25, createdAt: asOf, updatedAt: asOf })
    const membership = new UgcGroupMember({ id: makeUgcGroupMemberId("60000000-0000-4000-8000-000000000004"), groupId, creatorId, tierId: "tier-1", status: "active", joinedAt: asOf, completedAt: null })
    show(workspace(user, { campaigns: [campaign], groups: [group], memberships: [membership] }))
    expect(screen.getByRole("heading", { name: "GlowUp España" })).toBeDefined()
    expect(screen.getByRole("heading", { name: "Registrar vídeo" })).toBeDefined()
  })

  test("shows trial warming and publishing states from the server clock", () => {
    const trial = creator("trial", { _tag: "TrialData", startedAt: asOf, publishingStartsAt: "2026-08-24T00:00:00.000Z", publishingEndsAt: "2026-09-01T00:00:00.000Z", requiredVideoCount: 8, contract: { generatedAt: asOf, signedAt: asOf, locale: "es-ES", documentType: "DNI", documentNumber: "123", address: "Madrid", paymentMethod: "grade", renderedDocument: "Contrato" }, profile: { tiktokHandle: "@lucia", instagramHandle: null, phone: null } })
    show(workspace(trial))
    expect(screen.getByRole("heading", { name: "Calienta tu cuenta" })).toBeDefined()
  })
})
