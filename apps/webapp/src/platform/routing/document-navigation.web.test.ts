import { DocumentNavigation } from "@proxus/frontend-core/navigation"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { browserDocumentNavigationLayer } from "./document-navigation.web.js"

describe("browser document navigation", () => {
  it("assigns external URLs through the platform service", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const assigned: Array<string> = []
    const context = yield* Layer.build(
      browserDocumentNavigationLayer({ assign: (url) => { assigned.push(url) } }),
    )
    yield* Effect.gen(function*() {
      const navigation = yield* DocumentNavigation
      yield* navigation.assign("https://accounts.example.test/oauth")
    }).pipe(Effect.provide(context))
    expect(assigned).toEqual(["https://accounts.example.test/oauth"])
  }))))

  it("resolves same-origin mock callbacks against the current web origin", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const assigned: Array<string> = []
    const context = yield* Layer.build(
      browserDocumentNavigationLayer(
        { assign: (url) => { assigned.push(url) } },
        "http://vps.tailnet.test:5173/es",
      ),
    )
    yield* Effect.gen(function*() {
      const navigation = yield* DocumentNavigation
      yield* navigation.assign("/es?code=mock&state=signed")
    }).pipe(Effect.provide(context))
    expect(assigned).toEqual(["http://vps.tailnet.test:5173/es?code=mock&state=signed"])
  }))))

  it("maps host failures to DocumentNavigationError", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(
      browserDocumentNavigationLayer({ assign: () => { throw new Error("blocked") } }),
    )
    const failure = yield* Effect.gen(function*() {
      const navigation = yield* DocumentNavigation
      return yield* Effect.flip(navigation.assign("https://accounts.example.test/oauth"))
    }).pipe(Effect.provide(context))
    expect(failure).toMatchObject({ _tag: "DocumentNavigationError", message: "blocked" })
  }))))
})
