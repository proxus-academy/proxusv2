import { CreateCountryInput, RenameStudyNodePayload } from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedAdminClient } from "./test/http/embedded.js"

describe("admin embedded HTTP API", () => {
  test("runs administrative mutations through handlers, service and PGlite", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const client = yield* makeEmbeddedAdminClient
      const country = yield* client.adminStudyCatalog.createNode({
        payload: new CreateCountryInput({ name: "España" }),
      })
      const renamed = yield* client.adminStudyCatalog.renameNode({
        params: { nodeId: country.id },
        payload: new RenameStudyNodePayload({ name: "Reino de España" }),
      })
      expect(renamed.name).toBe("Reino de España")
      const published = yield* client.adminStudyCatalog.updateNodeStatus({
        params: { nodeId: country.id },
        payload: "published",
      })
      expect(published.status).toBe("published")
      expect(yield* client.adminStudyCatalog.listNodes({
        query: { kind: "country", status: "published" },
      })).toEqual([published])
    }))),
  15_000)
})
