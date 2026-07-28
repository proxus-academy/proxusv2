import { Effect, Layer, Schema } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { compile, index, layout, makeRouterService, memoryRouterLayer, param, path, root, RouteConfigurationError } from "./index.js"
import type { DestinationOf, RouteDestination, RouterService } from "./index.js"

const definition = root({ id: "root", children: [
  layout({ id: "shell", children: [
    index({ id: "home" }),
    path({
      id: "search",
      path: "search",
      query: Schema.Struct({
        id: Schema.String,
        page: Schema.optional(Schema.NumberFromString),
      }),
    }),
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
  it("only compiles a typed root and round-trips its runtime destination", () => {
    if (false) {
      // @ts-expect-error a path node cannot be a compiled definition root
      compile(path({ id: "orphan", path: "orphan" }))
    }

    const destination = router.destination("edit-user", { path: { userId: 42 } })
    const encoded = Effect.runSync(router.encode(destination))
    expect(encoded).toBe("/users/42/edit")
    expect(Effect.runSync(router.decode(encoded))).toMatchObject({
      destination: { id: "edit-user", params: { userId: 42 } },
      matches: [
        { id: "root", params: {} }, { id: "shell", params: {} }, { id: "users", params: {} },
        { id: "user", params: { userId: 42 } }, { id: "edit-user", params: { userId: 42 } },
      ],
    })
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

  it("supports sibling layouts when their terminal paths are unambiguous", () => {
    const routes = compile(root({ id: "root", children: [
      layout({ id: "public-only", children: [index({ id: "registration" }), path({ id: "login", path: "login" })] }),
      layout({ id: "authenticated", children: [path({ id: "home", path: "app" })] }),
    ] }))

    expect(Effect.runSync(routes.decode("/login")).matches.map(({ id }) => id)).toEqual([
      "root", "public-only", "login",
    ])
    expect(Effect.runSync(routes.decode("/app")).matches.map(({ id }) => id)).toEqual([
      "root", "authenticated", "home",
    ])
    expect(Effect.runSync(routes.decode("/")).matches.map(({ id }) => id)).toEqual([
      "root", "public-only", "registration",
    ])
  })

  it("rejects duplicate ids and ambiguous siblings", () => {
    expect(() => compile(root({ id: "r", children: [index({ id: "same" }), index({ id: "same" })] }))).toThrow(RouteConfigurationError)
    expect(() => compile(root({ id: "r", children: [
      param({ id: "a", name: "a", schema: Schema.String }),
      param({ id: "b", name: "b", schema: Schema.String }),
    ] }))).toThrow(/Ambiguous parameter/)
  })

  it("preserves destination ids and parameter types", () => {
    const valid = router.destination("edit-user", { path: { userId: 1 } })
    const typed: RouteDestination<"edit-user", { readonly userId: number }> = valid
    expect(typed).toBeDefined()
    // @ts-expect-error userId is decoded as a number
    const invalid = router.destination("edit-user", { path: { userId: "1" } })
    // @ts-expect-error parent nodes are matches, not final destinations
    const parent = router.destination("users")
    expect([invalid, parent]).toBeDefined()
  })

  it("keeps path and query inputs separate and schema-typed", () => {
    const destination = router.destination("search", {
      query: { id: "effect", page: 2 },
    })
    expect(Effect.runSync(router.encodeQuery(destination))).toBe("id=effect&page=2")
    expect(Effect.runSync(router.withQuery(destination, "id=router&page=3"))).toMatchObject({
      id: "search",
      params: {},
      query: { id: "router", page: 3 },
    })
    if (false) {
      // @ts-expect-error required query fields cannot be omitted
      const missingQuery = router.destination("search")
      // @ts-expect-error encoded URL strings are decoded to numbers for application code
      const invalidQuery = router.destination("search", { query: { id: "effect", page: "2" } })
      expect([missingQuery, invalidQuery]).toBeDefined()
    }
  })

  it("round-trips Unicode and reserved characters through segment codecs", () => {
    const textDefinition = root({ id: "root", children: [
      param({ id: "value", name: "value", schema: Schema.String }),
    ] })
    const textRoutes = compile(textDefinition)
    const value = "España/日本語 ?#%"
    const encoded = Effect.runSync(textRoutes.encode(textRoutes.destination("value", { path: { value } })))
    expect(encoded).toBe(`/${encodeURIComponent(value)}`)
    expect(Effect.runSync(textRoutes.decode(encoded)).destination.params).toEqual({ value })
  })

  it("supports a locale as the first typed path segment", () => {
    const localized = compile(root({ id: "root", children: [
      param({ id: "locale", name: "locale", schema: Schema.Literals(["es", "en"]), children: [
        path({ id: "register", path: "register" }),
      ] }),
    ] }))
    expect(Effect.runSync(localized.encode(localized.destination("register", { path: { locale: "en" } })))).toBe("/en/register")
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
      service.pushDestination(otherDestination)
    expect(rejectOtherRouter).toBeDefined()
  })

  it("supports push, replace, back and forward while restoring query history", () => {
    const Router = makeRouterService<TestDestination>("@proxus/frontend-core/routing/test/Router")
    const home = router.destination("home")
    const newUser = router.destination("new-user")
    const editUser = router.destination("edit-user", { path: { userId: 1 } })
    const registry = AtomRegistry.make()
    const test = Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(memoryRouterLayer(Router, router, home))
      return yield* Effect.gen(function*() {
        const service = yield* Router
        yield* service.pushDestination(editUser, { search: "step=country" })
        yield* service.pushDestination(newUser, { search: "step=university" })
        yield* service.back
        expect(registry.get(service.current).id).toBe("edit-user")
        expect(registry.get(service.location)).toMatchObject({
          search: "step=country",
          matches: [{ id: "root" }, { id: "shell" }, { id: "users" }, { id: "user" }, { id: "edit-user" }],
        })
        yield* service.forward
        expect(registry.get(service.current).id).toBe("new-user")
        expect(registry.get(service.location).search).toBe("step=university")
        yield* service.replaceDestination(home, { search: "step=complete" })
        expect(registry.get(service.location)).toMatchObject({
          destination: { id: "home" },
          search: "step=complete",
        })
        yield* service.navigate("edit-user", { path: { userId: 7 } })
        expect(registry.get(service.current)).toMatchObject({
          id: "edit-user",
          params: { userId: 7 },
        })
        yield* service.navigate("search", { query: { id: "effect", page: 2 } })
        expect(registry.get(service.location)).toMatchObject({
          destination: { id: "search", params: {}, query: { id: "effect", page: 2 } },
          matches: [{ id: "root" }, { id: "shell" }, { id: "search" }],
          search: "id=effect&page=2",
        })
        if (false) {
          // @ts-expect-error edit-user has a required path parameter
          const missingPath = service.navigate("edit-user")
          // @ts-expect-error search has a required query id
          const missingQuery = service.navigate("search")
          // @ts-expect-error page is represented as a number in application code
          const invalidPage = service.navigate("search", { query: { id: "effect", page: "2" } })
          expect([missingPath, missingQuery, invalidPage]).toBeDefined()
        }
      }).pipe(Effect.provide(context))
    }))
    Effect.runSync(test)
  })
})
