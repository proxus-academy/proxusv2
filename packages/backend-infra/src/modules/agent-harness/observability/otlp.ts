import { AgentTelemetry } from "@proxus/agent-harness/observability"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OtlpSerialization, OtlpTracer } from "effect/unstable/observability"
import { sanitizeAgentEvent } from "./console.js"

export interface AgentOtlpConfig { readonly endpoint: string; readonly serviceName: string; readonly serviceVersion: string; readonly environment: "staging" | "production"; readonly exportIntervalMs?: number; readonly maxBatchSize?: number }
/** OTLP exporter flushes when its owning Effect Scope closes. No prompts, outputs or IDs are annotated. */
export const agentOtlpLayer = (config: AgentOtlpConfig) => {
  const tracer = OtlpTracer.layer({ url: `${config.endpoint.replace(/\/$/, "")}/v1/traces`, resource: { serviceName: config.serviceName, serviceVersion: config.serviceVersion, attributes: { "deployment.environment": config.environment } }, exportInterval: config.exportIntervalMs ?? 5_000, maxBatchSize: config.maxBatchSize ?? 256, shutdownTimeout: 5_000 }).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer))
  const telemetry = Layer.succeed(AgentTelemetry, AgentTelemetry.of({ emit: (input) => {
    const event = sanitizeAgentEvent(input)
    return Effect.annotateCurrentSpan({ "agent.event.type": event.type, "agent.outcome": event.outcome, ...(event.operation === undefined ? {} : { "agent.operation": event.operation }), ...(event.errorCategory === undefined ? {} : { "agent.error.category": event.errorCategory }), ...event.annotations }).pipe(Effect.withSpan(`agent.${event.type}`))
  } }))
  return Layer.merge(tracer, telemetry)
}
