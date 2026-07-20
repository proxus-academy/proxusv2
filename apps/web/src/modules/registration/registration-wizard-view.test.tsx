// @vitest-environment happy-dom
import {
  StudyCatalogNotFound,
  StudyCatalogUnavailable,
  StudyCatalogUnexpected,
} from "@proxus/frontend-core/study-catalog"
import { catalogFor } from "@proxus/product-messages"
import {
  CountryNode,
  StudyNodeNotFound,
  makeCountryNodeId,
} from "@proxus/shared/study-catalog"
import { Cause, DateTime } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { RegistrationWizardView } from "./registration-wizard-view.js"

const country = new CountryNode({
  id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
  kind: "country",
  name: "España",
  imageAssetId: null,
  status: "published",
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
})
const messages = catalogFor("es")
const baseProps = {
  path: [] as const,
  landingAssignment: { _tag: "Success" as const, value: { variant: "short" as const } },
  navigationFailed: false,
  messages,
  languageSelector: <span>Español</span>,
  onSelect: vi.fn(),
  onBack: vi.fn(),
  onReset: vi.fn(),
  onRetryNavigation: vi.fn(),
}
const unavailable = new StudyCatalogUnavailable({
  error: new HttpApiError.InternalServerError({}),
})

describe("web registration view", () => {
  it("renders loading and choices with localized accessible copy", () => {
    const loading = renderToStaticMarkup(
      <RegistrationWizardView {...baseProps} options={{ _tag: "Initial" }} landingAssignment={{ _tag: "Initial" }} />,
    )
    const choices = renderToStaticMarkup(
      <RegistrationWizardView {...baseProps} options={{ _tag: "Success", value: [country] }} />,
    )

    expect(loading).toContain("Cargando experiencia de registro")
    expect(loading).toContain("Cargando opciones")
    expect(choices).toContain("España")
    expect(choices).toContain("Español")
  })

  it.each([
    [
      new StudyCatalogNotFound({ error: new StudyNodeNotFound({ nodeId: country.id }) }),
      "No se encontró el elemento solicitado.",
    ],
    [unavailable, "El servicio no está disponible. Inténtalo de nuevo."],
    [new StudyCatalogUnexpected({ cause: Cause.die("broken") }), "Ha ocurrido un error inesperado."],
  ])("renders the typed Study Catalog failure %#", (error, text) => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView {...baseProps} options={{ _tag: "Failure", error }} />,
    )
    expect(html).toContain(text)
  })

  it("renders localized retry copy for navigation failures", () => {
    const html = renderToStaticMarkup(
      <RegistrationWizardView {...baseProps} navigationFailed options={{ _tag: "Success", value: [country] }} />,
    )

    expect(html).toContain("Ha ocurrido un error inesperado.")
    expect(html).toContain("Reintentar")
  })

  it("imports the production story without changing History", () => {
    history.replaceState({ preserved: true }, "", "/before-story?campaign=one#summary")
    const before = location.href

    return import("./registration-wizard.stories.js").then(() => {
      expect(location.href).toBe(before)
      expect(history.state).toEqual({ preserved: true })
    })
  })
})
