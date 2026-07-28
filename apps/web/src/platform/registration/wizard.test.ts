import { registrationDraftTtlMs } from "@proxus/frontend-core/registration"
import { describe, expect, it } from "vitest"
import { makeWebRegistrationDraftStorage } from "./draft-storage.web.js"
import { decodeRegistrationQuery } from "./wizard-url.js"

const memory = () => {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}

describe("registration web codecs and draft", () => {
  it("rejects invalid deep links without consuming campaign", () => {
    const decoded = decodeRegistrationQuery("campaign=summer&step=verify&path=not-json")
    expect(decoded).toEqual({ step: "verify", path: [], valid: false })
    expect(new URLSearchParams("campaign=summer&step=verify&path=not-json").get("campaign")).toBe("summer")
  })

  it("round-trips a versioned session draft and expires it", () => {
    const backing = memory()
    const storage = makeWebRegistrationDraftStorage(backing)
    const draft = { provider: "email" as const, path: [] as const, problemKind: "prepare-exams" as const }
    expect(storage.save(draft, 100)).toBe(true)
    expect(storage.load(100)).toEqual(draft)
    expect(storage.load(101 + registrationDraftTtlMs)).toBeUndefined()
    expect(backing.values.size).toBe(0)
  })

  it("drops unknown versions and malformed records", () => {
    const backing = memory()
    backing.values.set("proxus.registration-draft", JSON.stringify({ version: 999, savedAt: 1, draft: { provider: "email", path: [] } }))
    expect(makeWebRegistrationDraftStorage(backing).load(1)).toBeUndefined()
  })

  it("degrades safely when sessionStorage is unavailable", () => {
    const storage = makeWebRegistrationDraftStorage({ getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") }, removeItem: () => { throw new Error("blocked") } })
    expect(storage.load(0)).toBeUndefined()
    expect(storage.save({ provider: "email", path: [] }, 0)).toBe(false)
    expect(storage.clear()).toBe(false)
  })
})
