import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { agentRunFixture, makeEmbeddedAdminWeb } from "./test/http/embedded.js"

const json = (response: Response) => Effect.promise(() => response.json())

describe("admin Agent runs HTTP API", () => {
  test("serves runs, detail, traces, payload metadata, not-found, and OpenAPI paths", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedAdminWeb
      const get = (path: string) => Effect.promise(() => web.handler(new Request(`http://proxus.test${path}`)))

      const listResponse = yield* get("/admin/agent-runs?limit=10")
      expect(listResponse.status).toBe(200)
      expect(yield* json(listResponse)).toEqual([expect.objectContaining({
        runId: agentRunFixture.runId,
        status: "Succeeded",
        turns: 2,
        inputTokens: 120,
        outputTokens: 45,
      })])
      const beforeResponse = yield* get("/admin/agent-runs?limit=10&before=1700000000000")
      expect(yield* json(beforeResponse)).toEqual([])

      const detailResponse = yield* get(`/admin/agent-runs/${agentRunFixture.runId}`)
      expect(detailResponse.status).toBe(200)
      expect(yield* json(detailResponse)).toEqual(expect.objectContaining({
        run: expect.objectContaining({ runId: agentRunFixture.runId }),
        limits: expect.objectContaining({ maxTurns: 8, deadlineMs: 60_000 }),
        usage: expect.objectContaining({ turns: 2, operations: 3 }),
        events: [
          { sequence: 1, type: "RunStarted", at: 1_700_000_000_000 },
          { sequence: 2, type: "TurnCompleted", at: 1_700_000_000_200, turn: 2 },
        ],
      }))

      const missingResponse = yield* get(`/admin/agent-runs/${agentRunFixture.missingRunId}`)
      expect(missingResponse.status).toBe(404)
      expect(yield* Effect.promise(() => missingResponse.text())).toBe("")

      const tracesResponse = yield* get(`/admin/agent-runs/${agentRunFixture.runId}/traces`)
      expect(tracesResponse.status).toBe(200)
      expect(yield* json(tracesResponse)).toEqual([expect.objectContaining({
        traceId: agentRunFixture.traceId,
        runId: agentRunFixture.runId,
        captureStatus: "stored",
        contentType: "application/json",
        contentEncoding: "gzip",
        payloadBytes: 4,
        schemaVersion: 1,
        redactionVersion: 1,
      })])

      const payloadResponse = yield* get(`/admin/agent-runs/${agentRunFixture.runId}/traces/${agentRunFixture.traceId}/payload`)
      expect(payloadResponse.status).toBe(200)
      expect(yield* json(payloadResponse)).toEqual({
        contentType: "application/json",
        contentEncoding: "gzip",
        bytesBase64: "AP8QgA==",
      })

      const openApiResponse = yield* get("/openapi.json")
      expect(openApiResponse.status).toBe(200)
      const document = (yield* json(openApiResponse)) as { paths: Record<string, unknown> }
      expect(Object.keys(document.paths)).toEqual(expect.arrayContaining([
        "/admin/agent-runs",
        "/admin/agent-runs/{runId}",
        "/admin/agent-runs/{runId}/traces",
        "/admin/agent-runs/{runId}/traces/{traceId}/payload",
      ]))
    }))),
  30_000)
})
