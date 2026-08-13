import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { validateProductionAuthAdapters } from "./auth.prod.js"

describe("production auth adapter safety", () => {
  test.each([
    ["console", "real"],
    ["real", "fake"],
    ["console", "fake"],
  ])("rejects development adapters (email=%s, google=%s)", (email, google) => {
    const exit = Effect.runSyncExit(validateProductionAuthAdapters(email, google))
    expect(exit._tag).toBe("Failure")
  })

  test("accepts only production adapter selection", () => {
    expect(Effect.runSyncExit(validateProductionAuthAdapters("real", "real"))._tag).toBe("Success")
  })
})
