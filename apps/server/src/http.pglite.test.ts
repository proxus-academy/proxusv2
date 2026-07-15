import {
  CreateCountryInput,
  CreateCountryTypeEdgeInput,
  CreateStudyTypeInput,
  RenameStudyNodePayload,
  StudyEdgeNotFound,
} from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedProxusClient } from "./test/http/embedded.js"

describe("Proxus embedded HTTP API", () => {
  test("runs the typed client through real handlers, services and PGlite", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const client = yield* makeEmbeddedProxusClient

          const country = yield* client.adminStudyCatalog.createNode({
            payload: new CreateCountryInput({ name: "España" }),
          })
          const studyType = yield* client.adminStudyCatalog.createNode({
            payload: new CreateStudyTypeInput({
              name: "Estudios universitarios",
            }),
          })
          if (country.kind !== "country") {
            return yield* Effect.die("Unexpected country response")
          }
          if (studyType.kind !== "type") {
            return yield* Effect.die("Unexpected study type response")
          }
          const edge = yield* client.adminStudyCatalog.connect({
            payload: new CreateCountryTypeEdgeInput({
              from: country.id,
              to: studyType.id,
            }),
          })

          expect((yield* client.publicStudyCatalog.getNode({
            params: { nodeId: country.id },
          }))).toEqual(country)
          expect((yield* client.publicStudyCatalog.getEdge({
            params: { edgeId: edge.id },
          }))).toEqual(edge)
          expect((yield* client.publicStudyCatalog.listOutgoingEdges({
            params: { nodeId: country.id },
          }))).toEqual([edge])
          expect((yield* client.publicStudyCatalog.listIncomingEdges({
            params: { nodeId: studyType.id },
          }))).toEqual([edge])
          expect((yield* client.publicStudyCatalog.listTargets({
            params: { nodeId: country.id },
          }))).toEqual([studyType])
          expect((yield* client.publicStudyCatalog.listSources({
            params: { nodeId: studyType.id },
          }))).toEqual([country])

          const renamed = yield* client.adminStudyCatalog.renameNode({
            params: { nodeId: country.id },
            payload: new RenameStudyNodePayload({ name: "Reino de España" }),
          })
          expect(renamed.name).toBe("Reino de España")

          const archived = yield* client.adminStudyCatalog.archiveNode({
            params: { nodeId: country.id },
          })
          expect(archived.status).toBe("archived")

          yield* client.adminStudyCatalog.disconnect({
            params: { edgeId: edge.id },
          })
          const missing = yield* client.publicStudyCatalog
            .getEdge({ params: { edgeId: edge.id } })
            .pipe(Effect.flip)
          expect(missing).toBeInstanceOf(StudyEdgeNotFound)
        }),
      ),
    ),
  )
})
