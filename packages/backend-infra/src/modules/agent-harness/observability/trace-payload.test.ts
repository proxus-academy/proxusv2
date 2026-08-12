// @effect-diagnostics nodeBuiltinImport:off
import { gunzipSync } from "node:zlib"
import { MAX_TRACE_ENVELOPE_BYTES, TRACE_PAYLOAD_SCHEMA_VERSION, TracePayloadEnvelope, type TracePayloadEnvelope as TracePayloadEnvelopeType } from "@proxus/agent-harness/observability"
import { Schema } from "effect"
import { describe, expect, test } from "vitest"
import { encodeBoundedTracePayload } from "./trace-payload.js"

const decode = (envelope: TracePayloadEnvelopeType) => {
  const json = gunzipSync(encodeBoundedTracePayload(envelope))
  return { json, envelope: Schema.decodeUnknownSync(TracePayloadEnvelope)(JSON.parse(json.toString("utf8"))) }
}

const baseEnvelope = (): TracePayloadEnvelopeType => ({
  schemaVersion: TRACE_PAYLOAD_SCHEMA_VERSION,
  redactionVersion: 1,
  provider: "provider",
  model: "model",
  startedAt: 1,
  request: { instructions: "instructions", messages: [{ role: "user", content: "message" }] },
  deltas: [{ sequence: 1, offsetMs: 0, text: "delta", truncated: false }],
  response: { text: "response", finishReason: "stop" },
  truncated: false,
})

describe("bounded trace payload", () => {
  test("strictly bounds oversized schema-v1 JSON with explicit truncation metadata", () => {
    const huge = "\\".repeat(250_000)
    const input = baseEnvelope()
    const oversized: TracePayloadEnvelopeType = {
      ...input,
      provider: huge,
      model: huge,
      request: { instructions: huge, messages: Array.from({ length: 100 }, () => ({ role: "user" as const, content: "message" })) },
      deltas: Array.from({ length: 100 }, (_, index) => ({ sequence: index + 1, offsetMs: index, text: huge.slice(0, 16_000), truncated: false })),
      response: { text: huge, finishReason: huge },
    }
    const first = decode(oversized)
    const second = decode(oversized)

    expect(first.json.byteLength).toBeLessThanOrEqual(MAX_TRACE_ENVELOPE_BYTES)
    expect(first.envelope.schemaVersion).toBe(1)
    expect(first.envelope.truncated).toBe(true)
    expect(first.json).toEqual(second.json)
  }, 15_000)

  test("redacts secrets before applying the total size bound", () => {
    const secret = "Bearer abcdefghijklmnopqrstuvwxyz0123456789"
    const { json, envelope } = decode({ ...baseEnvelope(), request: { instructions: secret, messages: [{ role: "user", content: `key ${secret}` }] }, response: { text: `result ${secret}`, finishReason: "stop" } })
    const text = json.toString("utf8")

    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz")
    expect(text).toContain("[REDACTED]")
    expect(envelope.truncated).toBe(false)
  })
})
