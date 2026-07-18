import { Effect, Layer, Schema } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { compile, index, layout, makeRouterService, memoryRouterLayer, param, path, root, RouteConfigurationError } from "./index.js"
import type { DestinationOf, RouteDestination, RouterService } from "./index.js"

const definition = root({ id: "root", children: [
  layout({ id: "shell", children: [
    index({ id: "home" }),
    path({ id: "users", path: "users", children: [
      path({ id: "new-user", path: "new" }),
      param({ id: "user", name: "userId", schema: Schema.NumberFromString, children: [
        path({ id: "edit-user", path: "edit" }),
      ] }),
    ] }),
  ] }),
] })
const router = compile(definition)
type TestDestination = DestinationOf<typeof definition>

describe("routing compiler", () => {
  it("encodes accumulated parameters and decodes a match chain", () => {
    expect(Effect.runSync(router.encode(router.destination("edit-user", { userId: 42 })))).toBe("/users/42/edit")
    expect(Effect.runSync(router.decode("/users/42/edit")).matches).toEqual([
      { id: "root", params: {} }, { id: "shell", params: {} }, { id: "users", params: {} },
      { id: "user", params: { userId: 42 } }, { id: "edit-user", params: { userId: 42 } },
    ])
  })

  it("keeps match parameters discriminated by route id", () => {
    const decoded = Effect.runSync(router.decode("/users/42/edit"))
    const match = decoded.matches.find((candidate) => candidate.id === "edit-user")
    if (match?.id === "edit-user") {
      const userId: number = match.params.userId
      // @ts-expect-error schema decoding produces a number, not a string
      const invalid: string = match.params.userId
      expect([userId, invalid]).toEqual([42, 42])
    }
  })

  it("gives static routes priority over parameters", () => {
    expect(Effect.runSync(router.decode("/users/new")).destination.id).toBe("new-user")
  })

  it("rejects duplicate ids and ambiguous siblings", () => {
    expect(() => compile(root({ id: "r", children: [index({ id: "same" }), index({ id: "same" })] }))).toThrow(RouteConfigurationError)
    expect(() => compile(root({ id: "r", children: [
      param({ id: "a", name: "a", schema: Schema.String }),
      param({ id: "b", name: "b", schema: Schema.String }),
    ] }))).toThrow(/Ambiguous parameter/)
  })

  it("preserves destination ids and parameter types", () => {
    const valid = router.destination("edit-user", { userId: 1 })
    const typed: RouteDestination<"edit-user", { readonly userId: number }> = valid
    expect(typed).toBeDefined()
    // @ts-expect-error userId is decoded as a number
    const invalid = router.destination("edit-user", { userId: "1" })
    // @ts-expect-error parent nodes are matches, not final destinations
    const parent = router.destination("users")
    expect([invalid, parent]).toBeDefined()
  })

  it("round-trips Unicode and reserved characters through segment codecs", () => {
    const textDefinition = root({ id: "root", children: [
      param({ id: "value", name: "value", schema: Schema.String }),
    ] })
    const textRoutes = compile(textDefinition)
    const value = "España/日本語 ?#%"
    const encoded = Effect.runSync(textRoutes.encode(textRoutes.destination("value", { value })))
    expect(encoded).toBe(`/${encodeURIComponent(value)}`)
    expect(Effect.runSync(textRoutes.decode(encoded)).destination.params).toEqual({ value })
  })

  it("supports a locale as the first typed path segment", () => {
    const localized = compile(root({ id: "root", children: [
      param({ id: "locale", name: "locale", schema: Schema.Literals(["es", "en"]), children: [
        path({ id: "register", path: "register" }),
      ] }),
    ] }))
    expect(Effect.runSync(localized.encode(localized.destination("register", { locale: "en" })))).toBe("/en/register")
    expect(Effect.runSync(localized.decode("/es/register")).destination.params).toEqual({ locale: "es" })
    expect(Effect.runSyncExit(localized.decode("/fr/register"))._tag).toBe("Failure")
  })

  it("treats malformed URL segments as not found", () => {
    expect(Effect.runSyncExit(router.decode("/users/%E0%A4%A"))._tag).toBe("Failure")
  })

  it("rejects destinations that encode to the same path through a layout", () => {
    expect(() => compile(root({ id: "root", children: [
      path({ id: "direct", path: "users" }),
      layout({ id: "nested", children: [
        path({ id: "inside-layout", path: "users" }),
      ] }),
    ] }))).toThrow(/same path pattern/)
  })

  it("requires parameter codecs encoded as strings", () => {
    // @ts-expect-error URL path codecs must encode to a string segment
    const invalid = param({ id: "invalid", name: "value", schema: Schema.Struct({ value: Schema.String }) })
    expect(invalid).toBeDefined()
  })
})

describe("memory router", () => {
  it("does not accept destinations from another route definition", () => {
    const otherDefinition = root({ id: "other-root", children: [index({ id: "other-home" })] })
    const otherRoutes = compile(otherDefinition)
    const otherDestination = otherRoutes.destination("other-home")
    const rejectOtherRouter = (service: RouterService<TestDestination>) =>
      // @ts-expect-error router services preserve their compiled destination union
      service.push(otherDestination)
    expect(rejectOtherRouter).toBeDefined()
  })

  it("supports push, replace, back and forward", () => {
    const Router = makeRouterService<TestDestination>("@proxus/frontend-core/routing/test/Router")
    const home = router.destination("home")
    const newUser = router.destination("new-user")
    const editUser = router.destination("edit-user", { userId: 1 })
    const registry = AtomRegistry.make()
    const test = Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(memoryRouterLayer(Router, home))
      return yield* Effect.gen(function*() {
        const service = yield* Router
        yield* service.push(editUser)
        yield* service.replace(newUser)
        yield* service.back
        expect(registry.get(service.current).id).toBe("home")
        yield* service.forward
        expect(registry.get(service.current).id).toBe("new-user")
      }).pipe(Effect.provide(context))
    }))
    Effect.runSync(test)
  })
})
