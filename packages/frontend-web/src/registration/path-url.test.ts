// @vitest-environment happy-dom
import { CountryNode, makeCountryNodeId } from "@proxus/shared/study-catalog"
import { DateTime } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeWebRegistrationPathAtom } from "./path-url.js"

const country = new CountryNode({
  id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
  kind: "country",
  name: "España",
  imageAssetId: null,
  status: "published",
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
})

describe("web registration path adapter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/")
    vi.useFakeTimers()
  })

  it("reads a path from the URL and reacts to browser navigation", () => {
    const encoded = encodeURIComponent(JSON.stringify([country]))
    window.history.replaceState({}, "", `/?path=${encoded}`)
    const atom = makeWebRegistrationPathAtom()
    const registry = AtomRegistry.make()

    expect(registry.get(atom)).toEqual([country])

    window.history.replaceState({}, "", "/")
    window.dispatchEvent(new Event("popstate"))
    expect(registry.get(atom)).toEqual([])
  })

  it("writes and clears the URL parameter", () => {
    const atom = makeWebRegistrationPathAtom()
    const registry = AtomRegistry.make()
    registry.mount(atom)

    registry.set(atom, [country])
    vi.advanceTimersByTime(500)
    expect(new URL(window.location.href).searchParams.has("path")).toBe(true)

    registry.set(atom, [])
    vi.advanceTimersByTime(500)
    expect(new URL(window.location.href).searchParams.has("path")).toBe(false)
  })
})
