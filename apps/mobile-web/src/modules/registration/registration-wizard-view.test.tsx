// @vitest-environment happy-dom
import {
  CountryNode,
  SubjectNode,
  makeCountryNodeId,
  makeSubjectNodeId,
} from "@proxus/shared/study-catalog"
import { DateTime } from "effect"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { RegistrationWizardView } from "./registration-wizard-view.js"

const handlers = {
  onSelect: vi.fn(),
  onBack: vi.fn(),
  onReset: vi.fn(),
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

describe("mobile registration view", () => {
  it("renders the mobile progress and available choices", () => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={{ _tag: "Success", value: [country] }} {...handlers} />,
    )

    expect(html).toContain("Step 1 of 5")
    expect(html).toContain("España")
  })

  it.each([
    [{ _tag: "Initial" as const }, "Loading options"],
    [{ _tag: "Failure" as const }, "The service is unavailable"],
    [{ _tag: "Success" as const, value: [] }, "There are no options available"],
  ])("renders remote state %#", (options, text) => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={options} {...handlers} />,
    )

    expect(html).toContain(text)
  })

  it.each([
    [{ _tag: "Initial" as const }, "Cargando experiencia de registro"],
    [{ _tag: "Failure" as const }, "The service is unavailable"],
    [{ _tag: "Success" as const, value: { variant: "long" as const } }, "Encuentra tu comunidad académica"],
  ])("keeps landing assignment state visible %#", (landingAssignment, text) => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[]} options={{ _tag: "Success", value: [country] }} landingAssignment={landingAssignment} {...handlers} />,
    )
    expect(html).toContain(text)
  })

  it("renders completion and the full selected path", () => {
    const subject = new SubjectNode({
      id: makeSubjectNodeId("20000000-0000-4000-8000-000000000002"),
      kind: "subject",
      name: "Álgebra",
      imageAssetId: null,
      status: "published",
      createdAt: DateTime.makeUnsafe(0),
      updatedAt: DateTime.makeUnsafe(0),
    })
    const html = renderToStaticMarkup(
      <RegistrationWizardView path={[subject]} options={{ _tag: "Success", value: [] }} {...handlers} />,
    )

    expect(html).toContain("All done!")
    expect(html).toContain("Álgebra")
    expect(html).toContain("Start again")
  })
})
