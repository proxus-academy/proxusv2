import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { featureFlagInstallationStorageKey, makeFeatureFlagInstallationIdentityWeb } from "./installation-identity.web.js"

describe("web feature flag installation identity", () => {
  test("persists and reuses one valid installation UUID", () => Effect.runPromise(Effect.gen(function*() {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const adapter = makeFeatureFlagInstallationIdentityWeb(storage, () => "00000000-0000-4000-8000-000000000001")
    const first = yield* adapter.getOrCreate()
    const second = yield* adapter.getOrCreate()
    expect(second).toBe(first)
    expect(values.get(featureFlagInstallationStorageKey)).toBe(first)
  })))

  test("keeps one in-memory identity when storage reads and writes are blocked", () => Effect.runPromise(Effect.gen(function*() {
    let generated = 0
    const storage = {
      getItem: (_key: string): string | null => {
        throw new Error("storage read blocked")
      },
      setItem: (_key: string, _value: string): void => {
        throw new Error("storage write blocked")
      },
    }
    const adapter = makeFeatureFlagInstallationIdentityWeb(storage, () => {
      generated++
      return "00000000-0000-4000-8000-000000000002"
    })

    const first = yield* adapter.getOrCreate()
    const second = yield* adapter.getOrCreate()
    expect(first).toBe("00000000-0000-4000-8000-000000000002")
    expect(second).toBe(first)
    expect(generated).toBe(1)
  })))
})
