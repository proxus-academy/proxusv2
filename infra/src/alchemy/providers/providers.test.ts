import * as Layer from "effect/Layer"
import { describe, expect, it } from "vitest"
import { proxusProviders } from "./providers.ts"

// Layer construction is synchronous and lazy: it must not resolve ADC, build a
// Stack, or execute any generated HTTP operation.
describe("Proxus Alchemy providers", () => {
  it("constructs the closed provider bundle without cloud access", () => {
    const providers = proxusProviders({
      project: "test-project",
      location: "europe-southwest1",
    })

    expect(Layer.isLayer(providers)).toBe(true)
  })
})
