import type { StudyNodeId } from "@proxus/shared/study-catalog"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PublicStudyCatalogClient } from "./client.js"

/** Shared catalog state. The application supplies its canonical runtime. */
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
