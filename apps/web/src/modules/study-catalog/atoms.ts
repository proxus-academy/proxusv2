import type { StudyNodeId } from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import {
  makeWebPublicStudyCatalogClientLayer,
  PublicStudyCatalogClient,
} from "./client.js"

const studyCatalogRuntime = Atom.runtime(
  makeWebPublicStudyCatalogClientLayer("/api"),
)

export const rootsAtom = studyCatalogRuntime.atom(
  Effect.gen(function*() {
    const catalog = yield* PublicStudyCatalogClient
    return yield* catalog.listRoots()
  }),
)

export const childrenFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.atom(
    Effect.gen(function*() {
      const catalog = yield* PublicStudyCatalogClient
      return yield* catalog.listChildren({ params: { nodeId } })
    }),
  ),
)
