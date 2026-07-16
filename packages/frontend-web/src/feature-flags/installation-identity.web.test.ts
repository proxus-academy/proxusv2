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
})
