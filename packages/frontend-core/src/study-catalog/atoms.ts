import type { StudyNodeId } from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { publicApiClient } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"
import { PublicStudyCatalogClient } from "./client.js"

/** Stable public catalog queries backed by the typed PublicApi client. */
export const publicStudyCatalogRootsQuery = applicationRuntime.atom(
  publicApiClient.pipe(
    Effect.flatMap((client) => client.publicStudyCatalog.listRoots()),
  ),
)

export const publicStudyCatalogChildrenQuery = Atom.family((nodeId: StudyNodeId) =>
  applicationRuntime.atom(
    publicApiClient.pipe(
      Effect.flatMap((client) => client.publicStudyCatalog.listChildren({ params: { nodeId } })),
    ),
  ),
)

/** @deprecated Existing clients may migrate independently to the stable queries above. */
export const makePublicStudyCatalogAtoms = <R, E = never>(
  runtime: Atom.AtomRuntime<PublicStudyCatalogClient | R, E>,
) => ({
  rootsAtom: runtime.atom(
    PublicStudyCatalogClient.use((client) => client.listRoots()),
  ),
  childrenFamily: Atom.family((nodeId: StudyNodeId) =>
    runtime.atom(
      PublicStudyCatalogClient.use((client) =>
        client.listChildren({ params: { nodeId } })
      ),
    ),
  ),
})

export type PublicStudyCatalogAtoms = ReturnType<typeof makePublicStudyCatalogAtoms>
