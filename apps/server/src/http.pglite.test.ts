import {
  FeatureFlagExposed,
  RecordProductAnalyticsBatchRequest,
  RecordProductAnalyticsBatchResponse,
} from "@proxus/shared/product-analytics"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedPublicClient } from "./test/http/embedded.js"

describe("public embedded HTTP API", () => {
  test("runs public operations through handlers, service and PGlite", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const client = yield* makeEmbeddedPublicClient
      expect(yield* client.publicStudyCatalog.listCountries()).toEqual([])
      expect(yield* client.publicStudyCatalog.listRoots()).toEqual([])
      expect(yield* client.recordBatch({
        payload: new RecordProductAnalyticsBatchRequest({
          events: [new FeatureFlagExposed({
            flagKey: "registration.landing",
            revision: 0,
            variant: "short",
          })],
        }),
      })).toEqual(new RecordProductAnalyticsBatchResponse({
        accepted: 0,
        rejected: 1,
        reason: "no-consent",
      }))
    }))),
  30_000)
})
