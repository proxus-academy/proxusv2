import { describe, expect, expectTypeOf, it } from "vitest"
import { catalogFor, catalogs, type MessagesCatalog } from "./catalog.js"

describe("product message catalogs", () => {
  it("provides every locale through the shared contract", () => {
    expect(catalogFor("es").registration.progress({ current: 2, total: 5 })).toBe("Paso 2 de 5")
    expect(catalogFor("en").registration.progress({ current: 2, total: 5 })).toBe("Step 2 of 5")
    expectTypeOf(catalogs.en).toMatchTypeOf<MessagesCatalog>()
  })
})
