import { PublicStudyCatalogClient } from "@proxus/frontend-core/study-catalog"
import { makeWebPublicStudyCatalogClientLayer } from "@proxus/frontend-web/study-catalog"
import type { StudyNodeId } from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

const runtime = Atom.runtime(makeWebPublicStudyCatalogClientLayer("/api"))

export const rootsAtom = runtime.atom(
  Effect.gen(function*() {
    const catalog = yield* PublicStudyCatalogClient
    return yield* catalog.listRoots()
  }),
)

export const childrenFamily = Atom.family((nodeId: StudyNodeId) =>
  runtime.atom(
    Effect.gen(function*() {
      const catalog = yield* PublicStudyCatalogClient
      return yield* catalog.listChildren({ params: { nodeId } })
    }),
  ),
)
