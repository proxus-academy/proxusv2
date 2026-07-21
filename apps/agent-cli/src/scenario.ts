// @effect-diagnostics nodeBuiltinImport:off globalErrorInEffectFailure:off preferSchemaOverJson:off strictEffectProvide:off
import { existsSync } from "node:fs"
import { makeRunId } from "@proxus/agent-harness/ids"
import { AgentTelemetry } from "@proxus/agent-harness/observability"
import { RunEngine, runEngineLayer, type RunRecord } from "@proxus/agent-harness/run"
import { SandboxProvider } from "@proxus/agent-harness/sandbox"
import { Skills } from "@proxus/agent-harness/skills"
import { AgentStore } from "@proxus/agent-harness/store"
import { scriptedModelLayer } from "@proxus/agent-harness/ai"
import { Effect, Layer } from "effect"

export const deterministicRunId = makeRunId("10000000-0000-4000-8000-000000000010")
export interface ScenarioReport { readonly run: RunRecord; readonly workspace: string; readonly workspaceExistsBeforeClose: boolean; readonly events: ReadonlyArray<{ readonly sequence: number; readonly type: string }>; readonly validation: string }

/** Fixture-only vertical scenario: it proves composition and lifecycle, not the step-11 engineering DSL. */
export const engineeringScenario = Effect.gen(function*() {
  const provider = yield* SandboxProvider
  const store = yield* AgentStore
  const skills = yield* Skills
  const telemetry = yield* AgentTelemetry
  const sandbox = yield* provider.acquire({ network: "denied", labels: { scenario: "deterministic-engineering" } })
  let validation = "not run"
  const handlers = {
    loadSkill: (name: string) => skills.load(name).pipe(Effect.map((loaded) => loaded.content.instructions), Effect.orDie),
    executeDsl: (source: string) => {
      const operation = source === "repository.readIssue()" ? sandbox.readText("fixture/issue.md")
        : source === "agents.delegate()" ? sandbox.writeText("work/analysis.txt", "Child: change greeting deterministically.\n").pipe(Effect.as("Child analysis completed in the shared workspace"))
        : source === "repository.prepareChange()" ? sandbox.writeText("work/greeting.txt", "hello deterministic agent\n").pipe(Effect.as("Prepared work/greeting.txt"))
        : source === "validation.run()" ? sandbox.run({ command: "node", args: ["-e", "const f=require('fs').readFileSync('work/greeting.txt','utf8');process.exit(f==='hello deterministic agent\\n'?0:1)"] }).pipe(Effect.map((result) => { validation = result.exitCode === 0 ? "passed" : "failed"; return `Validation ${validation}` }))
        : Effect.succeed(`Unsupported fixture operation: ${source}`)
      return operation.pipe(Effect.orDie)
    },
  }
  yield* sandbox.writeText("fixture/issue.md", "Issue: replace greeting and validate the result.\n")
  const model = scriptedModelLayer([
    { _tag: "Success", text: "Investigating", finishReason: "continue", toolCalls: [{ name: "loadSkill", input: { name: "deterministic-engineering" } }, { name: "executeDsl", input: { source: "repository.readIssue()" } }] },
    { _tag: "Success", text: "Delegating analysis", finishReason: "continue", toolCalls: [{ name: "executeDsl", input: { source: "agents.delegate()" } }] },
    { _tag: "Success", text: "Preparing deterministic change", finishReason: "continue", toolCalls: [{ name: "executeDsl", input: { source: "repository.prepareChange()" } }] },
    { _tag: "Success", text: "Prepared and validated deterministic change.", toolCalls: [{ name: "executeDsl", input: { source: "validation.run()" } }] },
  ], handlers)
  const engine = yield* RunEngine.pipe(Effect.provide(runEngineLayer().pipe(Layer.provide(model))))
  const run = yield* engine.start({ runId: deterministicRunId, instructions: "Use only the deterministic fixture operations.", input: "Investigate fixture issue, delegate analysis, prepare and validate the change.", limits: { maxTurns: 4, maxDslExecutions: 8, maxOperations: 8, maxInputTokens: 1000, maxOutputTokens: 1000, maxOutputBytes: 16_384, deadlineMs: 30_000, maxChildren: 1 } })
  const events = yield* store.events(run.id)
  yield* telemetry.emit({ type: "run.lifecycle", at: run.startedAt, outcome: run.status === "Succeeded" ? "succeeded" : "failed", annotations: { status: run.status, validation } })
  return { run, workspace: sandbox.workspace, workspaceExistsBeforeClose: existsSync(sandbox.workspace), events: events.map(({ sequence, type }) => ({ sequence, type })), validation } satisfies ScenarioReport
})
