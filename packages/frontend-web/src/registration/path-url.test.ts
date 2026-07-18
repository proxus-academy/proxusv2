import { makeObservableValue, type RouteDestination, type RouterService } from "@proxus/frontend-core/routing"
import { CountryNode, makeCountryNodeId } from "@proxus/shared/study-catalog"
import { DateTime, Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeWebRegistrationPathAtom } from "./path-url.js"

const country = new CountryNode({ id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"), kind: "country", name: "España", imageAssetId: null, status: "published", createdAt: DateTime.makeUnsafe(0), updatedAt: DateTime.makeUnsafe(0) })
const destination = { id: "registration", params: {} } as RouteDestination

const fixture = (search = "") => {
  const current = makeObservableValue(destination)
  const location = makeObservableValue({ destination, search })
  const router: RouterService<RouteDestination> = {
    current: current.atom,
    location: location.atom,
    error: makeObservableValue(undefined).atom,
    push: (next, options) => Effect.sync(() => location.set({ destination: next, search: options?.search ?? location.get().search })),
    replace: (next, options) => Effect.sync(() => location.set({ destination: next, search: options?.search ?? location.get().search })),
    back: Effect.void,
    forward: Effect.void,
  }
  return { atom: makeWebRegistrationPathAtom(router), location }
}

describe("router registration query projection", () => {
  it("reads, writes, and clears through router location", () => {
    const { atom, location } = fixture()
    const registry = AtomRegistry.make()
    registry.mount(atom)
    registry.set(atom, [country])
    expect(new URLSearchParams(location.get().search).has("path")).toBe(true)
    expect(registry.get(atom)).toEqual([country])
    registry.set(atom, [])
    expect(location.get().search).toBe("")
  })

  it("keeps unrelated query values", () => {
    const { atom, location } = fixture("campaign=summer")
    AtomRegistry.make().set(atom, [country])
    expect(new URLSearchParams(location.get().search).get("campaign")).toBe("summer")
  })
})
