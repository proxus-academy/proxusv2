import {
  StudyNodeNotFound,
  makeStudyNodeId,
} from "@proxus/shared/study-catalog"
import { Cause } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { describe, expect, it } from "vitest"
import { classifyStudyCatalogCause } from "./presentation.js"

describe("Study Catalog view errors", () => {
  it("preserves a typed not-found failure", () => {
    const cause = Cause.fail(new StudyNodeNotFound({
      nodeId: makeStudyNodeId("20000000-0000-4000-8000-000000000001"),
    }))
    expect(classifyStudyCatalogCause(cause)._tag).toBe("StudyCatalogNotFound")
  })

  it("classifies a typed server failure as unavailable", () => {
    const cause = Cause.fail(new HttpApiError.InternalServerError({}))
    expect(classifyStudyCatalogCause(cause)._tag).toBe("StudyCatalogUnavailable")
  })

  it("keeps a defect unexpected", () => {
    expect(classifyStudyCatalogCause(Cause.die("broken"))._tag).toBe("StudyCatalogUnexpected")
  })
})
