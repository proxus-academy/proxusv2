import { Schema } from "effect"

export const TRACE_PAYLOAD_SCHEMA_VERSION = 1 as const
export const TRACE_REDACTION_VERSION = 1 as const
export const MAX_TRACE_DELTA_BYTES = 16_384
export const MAX_TRACE_ENVELOPE_BYTES = 1_048_576

const boundedText = Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_TRACE_DELTA_BYTES)))
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const TraceStreamDelta = Schema.Struct({
  sequence: NonNegativeInt,
  offsetMs: NonNegativeInt,
  text: boundedText,
  truncated: Schema.Boolean,
})
export const TracePayloadEnvelope = Schema.Struct({
  schemaVersion: Schema.Literal(TRACE_PAYLOAD_SCHEMA_VERSION),
  redactionVersion: Schema.Literal(TRACE_REDACTION_VERSION),
  provider: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
  startedAt: NonNegativeInt,
  request: Schema.Struct({ instructions: Schema.String, messages: Schema.Array(Schema.Struct({ role: Schema.Literals(["user", "assistant"]), content: Schema.String })) }),
  deltas: Schema.Array(TraceStreamDelta),
  response: Schema.Struct({ text: Schema.String, finishReason: Schema.String }),
  truncated: Schema.Boolean,
})
export type TracePayloadEnvelope = typeof TracePayloadEnvelope.Type

const secretKey = /authorization|api[-_]?key|token|cookie|secret|password/i
const bearer = /\b(?:bearer|basic)\s+[a-z0-9._~+\/-]+=*/gi
const googleKey = /\bAIza[0-9A-Za-z_-]{20,}\b/g
export const redactTraceText = (value: string): string => value.replace(bearer, "[REDACTED]").replace(googleKey, "[REDACTED]")
export const redactTraceValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactTraceText(value)
  if (Array.isArray(value)) return value.map(redactTraceValue)
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretKey.test(key) ? "[REDACTED]" : redactTraceValue(item)]))
  return value
}

const encoder = new TextEncoder()
export const truncateTraceDelta = (text: string): { readonly text: string; readonly truncated: boolean } => {
  if (encoder.encode(text).byteLength <= MAX_TRACE_DELTA_BYTES) return { text, truncated: false }
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (encoder.encode(text.slice(0, middle)).byteLength <= MAX_TRACE_DELTA_BYTES) low = middle
    else high = middle - 1
  }
  if (low > 0 && low < text.length && /[\uD800-\uDBFF]/.test(text[low - 1]!)) low -= 1
  return { text: text.slice(0, low), truncated: true }
}
