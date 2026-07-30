import { Schema } from "effect"
import { describe, expect, expectTypeOf, it } from "vitest"
import {
  createRouter,
  index,
  layout,
  route,
  type PathParamNames,
  type RouterDestination,
} from "./index.js"

const Locale = Schema.Literals(["es", "en"])
const StudyId = Schema.String.pipe(Schema.brand("StudyId"))
const StudySearch = Schema.Struct({
  tab: Schema.optional(Schema.Literals(["summary", "participants"])),
})

const studyRoute = route({
  id: "study",
  path: "studies/:studyId",
  params: {
    studyId: StudyId,
  },
  search: StudySearch,
  Component: ({ params, search }) => {
    expectTypeOf(params.studyId).toEqualTypeOf<Schema.Schema.Type<typeof StudyId>>()
    expectTypeOf(search.tab).toEqualTypeOf<"summary" | "participants" | undefined>()
    return null
  },
})

const applicationRouter = createRouter([
  route({
    path: ":locale",
    params: {
      locale: Locale,
    },
    Component: ({ params }) => {
      expectTypeOf(params.locale).toEqualTypeOf<"es" | "en">()
      return null
    },
    children: [
      route({
        id: "login",
        path: "login",
        params: {},
        Component: () => null,
      }),
      layout({
        Layout: () => null,
        children: [
          index({
            id: "home",
            Component: () => null,
          }),
          studyRoute,
        ],
      }),
    ],
  }),
], {
  NotFound: ({ location }) => location.pathname,
  InvalidUrl: ({ issues }) => issues.length,
  Error: () => null,
})

type Destination = RouterDestination<typeof applicationRouter>

describe("type-safe route contracts", () => {
  it("extracts dynamic path parameter names", () => {
    expectTypeOf<PathParamNames<"organizations/:organizationId/studies/:studyId">>()
      .toEqualTypeOf<"organizationId" | "studyId">()
  })

  it("accumulates parent params in destinations", () => {
    const destination = {
      id: "study",
      params: {
        locale: "es",
        studyId: StudyId.make("study-1"),
      },
      search: {
        tab: "participants",
      },
    } as const satisfies Destination

    expect(destination.id).toBe("study")
  })

  it("rejects malformed route definitions and destinations", () => {
    if (false) {
      route({
        path: "studies/:studyId",
        // @ts-expect-error studyId must have a schema
        params: {},
        Component: () => null,
      })

      route({
        path: "studies",
        // @ts-expect-error unknown path parameter
        params: { studyId: StudyId },
        Component: () => null,
      })

      route({
        path: "studies/:studyId",
        params: { studyId: StudyId },
        // @ts-expect-error route components cannot require undeclared params
        Component: (
          _props: {
            readonly params: {
              readonly studyId: Schema.Schema.Type<typeof StudyId>
              readonly undeclared: string
            }
            readonly search: {}
          },
        ) => null,
      })

      const missingLocale = {
        id: "study",
        params: {
          studyId: "study-1",
        },
        search: {},
      } as const

      // @ts-expect-error inherited locale is required
      const _invalidDestination: Destination = missingLocale
    }

    expect(true).toBe(true)
  })
})
