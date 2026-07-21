import { describe, expect, expectTypeOf, it } from "vitest"
import { catalogFor, catalogs, type MessagesCatalog } from "./catalog.js"

describe("product message catalogs", () => {
  it("provides every locale through the shared contract", () => {
    expect(catalogFor("es").registration.progress({ current: 2, total: 5 })).toBe("Paso 2 de 5")
    expect(catalogFor("en").registration.progress({ current: 2, total: 5 })).toBe("Step 2 of 5")
    expect(catalogFor("es").registration.longDescription).toBe(
      "Encuentra tu comunidad académica y personaliza tu recorrido en pocos pasos.",
    )
    expect(catalogFor("en").registration.longDescription).toBe(
      "Find your academic community and personalize your journey in just a few steps.",
    )
    expect(catalogFor("es").registration.landingLoading).toBe("Cargando experiencia de registro")
    expect(catalogFor("en").registration.landingLoading).toBe("Loading registration experience")
    expectTypeOf(catalogs.en).toMatchTypeOf<MessagesCatalog>()
  })
})
