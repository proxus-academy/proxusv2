import { Effect, Schema } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Hydration from "effect/unstable/reactivity/Hydration"
import { describe, expect, it } from "vitest"
import {
  createRouter,
  index,
  layout,
  makeMemoryHistory,
  route,
} from "./index.js"

const makeTestRouter = () => createRouter([
  route({
    path: ":locale",
    params: {
      locale: Schema.Literals(["es", "en"]),
    },
    Component: () => null,
    children: [
      layout({
        Layout: () => null,
        children: [
          index({
            id: "home",
            Component: () => null,
          }),
          route({
            id: "study",
            path: "studies/:studyId",
            params: {
              studyId: Schema.String.pipe(Schema.brand("StudyId")),
            },
            search: Schema.Struct({
              tab: Schema.optional(
                Schema.Literals(["summary", "participants"]),
              ),
            }),
            Component: () => null,
          }),
        ],
      }),
    ],
  }),
], {
  NotFound: () => null,
  InvalidUrl: () => null,
  Error: () => null,
}, {
  initialLocation: {
    pathname: "/es",
    search: "",
    hash: "",
  },
  snapshotKey: "test/router/location",
})

describe("router runtime", () => {
  it("matches, navigates and follows memory history", () => {
    const router = makeTestRouter()
    const registry = AtomRegistry.make()
    const history = makeMemoryHistory({
      pathname: "/es",
      search: "",
      hash: "",
    })
    const stop = router.start(registry, history)

    expect(registry.get(router.matchAtom)._tag).toBe("Matched")

    Effect.runSync(router.navigate({
      id: "study",
      params: {
        locale: "es",
        studyId: Schema.String.pipe(Schema.brand("StudyId")).make("study-1"),
      },
      search: {
        tab: "participants",
      },
    }))

    expect(registry.get(router.locationAtom)).toEqual({
      pathname: "/es/studies/study-1",
      search: "?tab=participants",
      hash: "",
    })

    Effect.runSync(router.back)
    expect(registry.get(router.locationAtom).pathname).toBe("/es")
    stop()
  })

  it("dehydrates and hydrates the source location atom", () => {
    const sourceRouter = makeTestRouter()
    const sourceRegistry = AtomRegistry.make()
    sourceRegistry.set(sourceRouter.locationAtom, {
      pathname: "/en",
      search: "?tab=summary",
      hash: "#details",
    })

    const snapshot = Hydration.dehydrate(sourceRegistry)
    const targetRouter = makeTestRouter()
    const targetRegistry = AtomRegistry.make()
    Hydration.hydrate(targetRegistry, snapshot)

    expect(targetRegistry.get(targetRouter.locationAtom)).toEqual({
      pathname: "/en",
      search: "?tab=summary",
      hash: "#details",
    })
  })

  it("distinguishes unmatched and invalid URLs", () => {
    const router = makeTestRouter()
    const registry = AtomRegistry.make()

    registry.set(router.locationAtom, {
      pathname: "/es/unknown",
      search: "",
      hash: "",
    })
    expect(registry.get(router.matchAtom)._tag).toBe("NotFound")

    registry.set(router.locationAtom, {
      pathname: "/fr",
      search: "",
      hash: "",
    })
    expect(registry.get(router.matchAtom)._tag).toBe("InvalidUrl")
  })
})
