// @vitest-environment happy-dom
import { appendRegistrationNode, type RegistrationPath } from "@proxus/frontend-core/registration"
import {
  StudyCatalogNotFound,
  StudyCatalogUnavailable,
  StudyCatalogUnexpected,
} from "@proxus/frontend-core/study-catalog"
import { catalogFor } from "@proxus/product-messages"
import {
  CountryNode,
  DegreeNode,
  StudyNodeNotFound,
  StudyTypeNode,
  SubjectNode,
  UniversityNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
} from "@proxus/shared/study-catalog"
import { Cause, DateTime } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { RegistrationWizardView } from "./registration-wizard-view.js"

const handlers = {
  onSelect: vi.fn(),
  onBack: vi.fn(),
  onReset: vi.fn(),
  onRetryNavigation: vi.fn(),
}

const country = new CountryNode({
  id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
  kind: "country",
  name: "España",
  imageAssetId: null,
  status: "published",
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
})
const messages = catalogFor("en")
const surface = {
  landingAssignment: { _tag: "Success" as const, value: { variant: "short" as const } },
  navigationFailed: false,
  messages,
  languageSelector: <span>English</span>,
}
const unavailable = new StudyCatalogUnavailable({
  error: new HttpApiError.InternalServerError({}),
})

describe("mobile registration view", () => {
  it("renders the mobile progress and available choices", () => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={{ _tag: "Success", value: [country] }} {...surface} {...handlers} />,
    )

    expect(html).toContain("Step 1 of 5")
    expect(html).toContain("España")
  })

  it.each([
    [{ _tag: "Initial" as const }, "Loading options"],
    [{ _tag: "Failure" as const, error: unavailable }, "The service is unavailable"],
    [{ _tag: "Success" as const, value: [] }, "There are no options available"],
  ])("renders remote state %#", (options, text) => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={options} {...surface} {...handlers} />,
    )

    expect(html).toContain(text)
  })

  it.each([
    [
      new StudyCatalogNotFound({ error: new StudyNodeNotFound({ nodeId: country.id }) }),
      "The requested item could not be found.",
    ],
    [unavailable, "The service is unavailable. Please try again."],
    [new StudyCatalogUnexpected({ cause: Cause.die("broken") }), "Something went wrong."],
  ])("renders the typed Study Catalog failure %#", (error, text) => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={{ _tag: "Failure", error }} {...surface} {...handlers} />,
    )
    expect(html).toContain(text)
  })

  it.each([
    [{ _tag: "Initial" as const }, "Loading registration experience"],
    [{ _tag: "Failure" as const }, "The service is unavailable"],
    [{ _tag: "Success" as const, value: { variant: "long" as const } }, "Find your academic community"],
  ])("keeps landing assignment state visible %#", (landingAssignment, text) => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView
        path={[]}
        options={{ _tag: "Success", value: [country] }}
        {...surface}
        landingAssignment={landingAssignment}
        {...handlers}
      />,
    )
    expect(html).toContain(text)
  })

  it("renders localized retry copy for navigation failures", () => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={{ _tag: "Success", value: [country] }} {...surface} navigationFailed {...handlers} />,
    )

    expect(html).toContain("Something went wrong.")
    expect(html).toContain("Retry")
  })

  it("renders completion and the full selected path", () => {
    const studyType = new StudyTypeNode({
      id: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"),
      kind: "type",
      name: "Universidad",
      imageAssetId: null,
      status: "published",
      createdAt: DateTime.makeUnsafe(0),
      updatedAt: DateTime.makeUnsafe(0),
    })
    const university = new UniversityNode({
      id: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"),
      kind: "university",
      name: "UCM",
      imageAssetId: null,
      status: "published",
      createdAt: DateTime.makeUnsafe(0),
      updatedAt: DateTime.makeUnsafe(0),
    })
    const degree = new DegreeNode({
      id: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"),
      kind: "degree",
      name: "Informática",
      imageAssetId: null,
      status: "published",
      createdAt: DateTime.makeUnsafe(0),
      updatedAt: DateTime.makeUnsafe(0),
    })
    const subject = new SubjectNode({
      id: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"),
      kind: "subject",
      name: "Álgebra",
      imageAssetId: null,
      status: "published",
      createdAt: DateTime.makeUnsafe(0),
      updatedAt: DateTime.makeUnsafe(0),
    })
    let path: RegistrationPath = []
    for (const node of [country, studyType, university, degree, subject]) {
      path = appendRegistrationNode(path, node)
    }
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={path} options={{ _tag: "Success", value: [] }} {...surface} {...handlers} />,
    )

    expect(html).toContain("All done!")
    expect(html).toContain("Álgebra")
    expect(html).toContain("Start again")
  })
})
