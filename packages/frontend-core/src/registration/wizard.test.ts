import { CountryNode, DegreeNode, StudyNode, StudyTypeNode, SubjectNode, UniversityNode, makeCountryNodeId, makeDegreeNodeId, makeStudyTypeNodeId, makeSubjectNodeId, makeUniversityNodeId } from "@proxus/shared/study-catalog"
import { CurrentSession, makeAccountId, makeSessionId } from "@proxus/shared/auth"
import { DateTime, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { RegistrationPath } from "./model.js"
import { firstIncompleteStep, guardRegistrationStep, selectStudyNode, transitionRegistration, type RegistrationState } from "./wizard.js"

const common = { imageAssetId: null, status: "published" as const, createdAt: DateTime.makeUnsafe(0), updatedAt: DateTime.makeUnsafe(0) }
const nodes = [
  new CountryNode({ ...common, id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"), kind: "country", name: "ES" }),
  new StudyTypeNode({ ...common, id: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"), kind: "type", name: "University" }),
  new UniversityNode({ ...common, id: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"), kind: "university", name: "U" }),
  new DegreeNode({ ...common, id: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"), kind: "degree", name: "D" }),
  new SubjectNode({ ...common, id: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"), kind: "subject", name: "S" }),
] as const

const path = Schema.decodeUnknownSync(RegistrationPath)(
  Schema.encodeSync(Schema.Array(StudyNode))(nodes),
)
const session = Schema.decodeUnknownSync(CurrentSession)({
  sessionId: makeSessionId("00000000-0000-4000-8000-000000000001"),
  account: { id: makeAccountId("00000000-0000-4000-8000-000000000002"), email: "safe@example.test", username: "safe_user", status: "active", provider: "email" },
  expiresAt: "1970-01-01T00:00:00.000Z",
})
const complete = { provider: "email" as const, problemKind: "understand-content" as const, path, username: "learner", birthYear: 2000 }

describe("registration machine", () => {
  it("runs every email onboarding transition and rejects out-of-state events", () => {
    let state: RegistrationState = { _tag: "ChoosingMethod" }
    expect(transitionRegistration(state, { _tag: "CodeVerified", session })).toBe(state)
    state = transitionRegistration(state, { _tag: "EmailStarted" })
    state = transitionRegistration(state, { _tag: "ProblemSelected", kind: "understand-content" })
    for (const node of nodes) state = transitionRegistration(state, { _tag: "StudyNodeSelected", node })
    state = transitionRegistration(state, { _tag: "ProfileCompleted", username: "learner", birthYear: 2000 })
    expect(state).toMatchObject({ _tag: "CollectingOnboarding", step: "account" })
    state = transitionRegistration(state, { _tag: "EmailSubmitted", draftId: "draft", maskedEmail: "l***@x.test" })
    expect(state._tag).toBe("EmailVerificationPending")
    state = transitionRegistration(state, { _tag: "CodeVerified", session })
    expect(state._tag).toBe("Completed")
  })

  it("resolves all Google branches", () => {
    const resolving = transitionRegistration({ _tag: "ChoosingMethod" }, { _tag: "GoogleStarted" })
    expect(transitionRegistration(resolving, { _tag: "GoogleResolved", result: { _tag: "Existing", session } })._tag).toBe("Completed")
    expect(transitionRegistration(resolving, { _tag: "GoogleResolved", result: { _tag: "New" } })).toMatchObject({ _tag: "CollectingOnboarding", draft: { provider: "google" } })
    expect(transitionRegistration(resolving, { _tag: "GoogleResolved", result: { _tag: "Conflict" } })._tag).toBe("ChoosingMethod")
  })

  it("guards invalid deep links and provider-only terminal steps", () => {
    expect(guardRegistrationStep("verify", { provider: "email", path: [] })).toBe("problem")
    expect(guardRegistrationStep("subject", { provider: "email", problemKind: "understand-content", path: [] })).toBe("country")
    expect(guardRegistrationStep("confirm-google", complete)).toBe("account")
    expect(firstIncompleteStep({ ...complete, provider: "google" })).toBe("confirm-google")
  })

  it("replacing an ancestor truncates all descendants", () => {
    const replacement = new CountryNode({ ...common, id: makeCountryNodeId("20000000-0000-4000-8000-000000000099"), kind: "country", name: "PT" })
    expect(selectStudyNode(path, replacement)).toEqual([replacement])
  })
})
