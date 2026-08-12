// @effect-diagnostics nodeBuiltinImport:off anyUnknownInErrorContext:off strictEffectProvide:off globalDate:off globalDateInEffect:off
import { createHash, randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"
import { makeArtifactId } from "@proxus/agent-harness/ids"
import { MAX_TRACE_ENVELOPE_BYTES, TRACE_PAYLOAD_SCHEMA_VERSION, TRACE_REDACTION_VERSION, redactTraceText, redactTraceValue, truncateTraceDelta, type TracePayloadEnvelope } from "@proxus/agent-harness/observability"
import { AgentTraceStore, ArtifactStore, type AgentTraceRecord } from "@proxus/agent-harness/store"
import { OneTurnModel, type ModelTurnStreamEvent } from "@proxus/agent-harness/ai"
import { Effect, Layer, Stream } from "effect"

export interface TechnicalTraceConfig { readonly provider: string; readonly model: string; readonly tenantId: string }
const bestEffort = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.catch(() => Effect.void), Effect.asVoid)
const id = () => randomUUID().replaceAll("-", "")
const encoder = new TextEncoder()
const jsonBytes = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value))
const halve = (value: string, minimum = 0): string => value.slice(0, Math.max(minimum, Math.floor(value.length / 2)))

/** Encodes a schema-v1 envelope whose uncompressed JSON is strictly size bounded. */
export const encodeBoundedTracePayload = (envelope: TracePayloadEnvelope): Uint8Array => {
  let current = redactTraceValue(envelope) as TracePayloadEnvelope
  let bytes = jsonBytes(current)
  while (bytes.byteLength > MAX_TRACE_ENVELOPE_BYTES) {
    if (!current.truncated) {
      current = { ...current, truncated: true }
    } else if (current.deltas.length > 0) {
      current = { ...current, deltas: current.deltas.slice(0, Math.floor(current.deltas.length / 2)) }
    } else if (current.request.messages.length > 0) {
      current = { ...current, request: { ...current.request, messages: current.request.messages.slice(0, Math.floor(current.request.messages.length / 2)) } }
    } else {
      const candidates = [
        { size: current.request.instructions.length, reducible: current.request.instructions.length > 0, update: () => ({ ...current, request: { ...current.request, instructions: halve(current.request.instructions) } }) },
        { size: current.response.text.length, reducible: current.response.text.length > 0, update: () => ({ ...current, response: { ...current.response, text: halve(current.response.text) } }) },
        { size: current.response.finishReason.length, reducible: current.response.finishReason.length > 0, update: () => ({ ...current, response: { ...current.response, finishReason: halve(current.response.finishReason) } }) },
        { size: current.provider.length, reducible: current.provider.length > 1, update: () => ({ ...current, provider: halve(current.provider, 1) }) },
        { size: current.model.length, reducible: current.model.length > 1, update: () => ({ ...current, model: halve(current.model, 1) }) },
      ].filter(({ reducible }) => reducible)
      const candidate = candidates.sort((left, right) => right.size - left.size)[0]
      if (candidate === undefined) throw new Error("Trace payload schema overhead exceeds MAX_TRACE_ENVELOPE_BYTES")
      current = candidate.update()
    }
    bytes = jsonBytes(current)
  }
  return gzipSync(bytes)
}

/** Decorates the application-owned model. Payload persistence never changes model outcome. */
export const technicalTraceModelLayer = (config: TechnicalTraceConfig): Layer.Layer<OneTurnModel, never, OneTurnModel | ArtifactStore | AgentTraceStore> => Layer.effect(OneTurnModel, Effect.gen(function*() {
  const underlying = yield* OneTurnModel
  const artifacts = yield* ArtifactStore
  const traces = yield* AgentTraceStore
  return OneTurnModel.of({
    generate: underlying.generate,
    stream: (input) => {
      if (input.invocation === undefined) return underlying.stream(input)
      const traceId = id(); const spanId = id().slice(0, 16); const startedAt = Date.now(); const artifactId = makeArtifactId(randomUUID())
      const base: AgentTraceRecord = { traceId, spanId, runId: input.invocation.runId, turn: input.invocation.turn, provider: config.provider, model: config.model, status: "started", captureStatus: "pending", startedAt, schemaVersion: TRACE_PAYLOAD_SCHEMA_VERSION, redactionVersion: TRACE_REDACTION_VERSION }
      const deltas: TracePayloadEnvelope["deltas"][number][] = []
      let completed: Extract<ModelTurnStreamEvent, { readonly _tag: "Completed" }> | undefined
      const source = underlying.stream(input).pipe(Stream.tap((event) => Effect.sync(() => {
        if (event._tag === "TextDelta") { const delta = truncateTraceDelta(redactTraceText(event.delta)); deltas.push({ sequence: deltas.length + 1, offsetMs: Date.now() - startedAt, ...delta }) }
        else completed = event
      })))
      const finish = Effect.suspend(() => {
        const endedAt = Date.now()
        if (completed === undefined) return bestEffort(traces.upsert({ ...base, status: "failed", captureStatus: "failed", completedAt: endedAt, durationMs: endedAt - startedAt, captureErrorCategory: "stream-incomplete" }))
        const result = completed.result
        const envelope: TracePayloadEnvelope = { schemaVersion: TRACE_PAYLOAD_SCHEMA_VERSION, redactionVersion: TRACE_REDACTION_VERSION, provider: config.provider, model: config.model, startedAt, request: { instructions: redactTraceText(input.instructions), messages: input.context.map((message) => ({ ...message, content: redactTraceText(message.content) })) }, deltas, response: { text: redactTraceText(result.text), finishReason: result.finishReason }, truncated: deltas.some((delta) => delta.truncated) }
        const bytes = encodeBoundedTracePayload(envelope); const sha = createHash("sha256").update(bytes).digest("hex")
        return artifacts.put({ id: artifactId, runId: input.invocation!.runId, tenantId: config.tenantId, contentType: "application/json", classification: "encrypted-debug", bytes, createdAt: endedAt }).pipe(
          Effect.flatMap(() => traces.upsert({ ...base, status: "succeeded", captureStatus: "stored", completedAt: endedAt, durationMs: endedAt - startedAt, ...(result.usage.inputTokens === undefined ? {} : { inputTokens: result.usage.inputTokens }), ...(result.usage.outputTokens === undefined ? {} : { outputTokens: result.usage.outputTokens }), artifactId, payloadSha256: sha, payloadBytes: bytes.byteLength, contentType: "application/json", contentEncoding: "gzip" })),
          Effect.catch(() => traces.upsert({ ...base, status: "succeeded", captureStatus: "failed", completedAt: endedAt, durationMs: endedAt - startedAt, captureErrorCategory: "artifact-write" }).pipe(Effect.catch(() => Effect.void))),
          Effect.asVoid,
        )
      })
      return Stream.unwrap(bestEffort(traces.upsert(base)).pipe(Effect.as(source.pipe(Stream.ensuring(finish)))))
    },
  })
}))
