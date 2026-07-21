// @effect-diagnostics strictBooleanExpressions:off preferSchemaOverJson:off
import { AgentTelemetry, type SafeAgentEvent, type SafeTelemetryValue } from "@proxus/agent-harness/observability"
import { Effect, Layer } from "effect"

const sensitiveKey = /authorization|cookie|credential|password|private.?key|prompt|reasoning|completion|raw|secret|token/i
const sensitiveValue = /(bearer\s+|gh[pousr]_)[a-z0-9._-]+/gi
const allowedAnnotation = /^(agent\.id|agent\.version|deployment|dsl\.operation|model\.profile|sandbox\.provider|status|validation|worker\.recovery)$/
export const redactAgentTelemetry = (value: unknown, key = ""): unknown => {
  if (sensitiveKey.test(key)) return "[REDACTED]"
  if (typeof value === "string") return value.replace(sensitiveValue, "[REDACTED]").slice(0, 128)
  if (Array.isArray(value)) return value.map((item) => redactAgentTelemetry(item))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactAgentTelemetry(item, name)]))
  return value
}
export const safeTelemetryAnnotations = (annotations: Readonly<Record<string, SafeTelemetryValue>> = {}) => Object.fromEntries(Object.entries(annotations).filter(([key]) => allowedAnnotation.test(key)).map(([key, value]) => [key, redactAgentTelemetry(value, key)]))
export const sanitizeAgentEvent = (event: SafeAgentEvent) => ({ type: event.type, at: event.at, outcome: event.outcome, ...(event.operation === undefined ? {} : { operation: event.operation }), ...(event.errorCategory === undefined ? {} : { errorCategory: event.errorCategory }), ...(event.durationBucket === undefined ? {} : { durationBucket: event.durationBucket }), annotations: safeTelemetryAnnotations(event.annotations) })

export const consoleAgentTelemetryLayer = (write: (line: string) => void = console.log): Layer.Layer<AgentTelemetry> => Layer.succeed(AgentTelemetry, AgentTelemetry.of({ emit: (event) => Effect.sync(() => write(JSON.stringify(sanitizeAgentEvent(event)))) }))
