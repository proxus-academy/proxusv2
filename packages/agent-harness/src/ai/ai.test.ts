import { describe, expect, it } from "vitest"
import { Effect, Schema } from "effect"
import { ExecuteDslTool, LoadSkillTool } from "./effect-ai.js"
import { ModelTurnFailure, OneTurnModel, scriptedModelLayer } from "./model-turn.js"

describe("internal model toolkit", () => {
  it("has the deliberately tiny exact schemas", () => {
    expect(Schema.decodeUnknownSync(LoadSkillTool.parametersSchema)({ name: "review" })).toEqual({ name: "review" })
    expect(() => Schema.decodeUnknownSync(LoadSkillTool.parametersSchema)({ name: "" })).toThrow()
    expect(Schema.decodeUnknownSync(ExecuteDslTool.parametersSchema)({ source: "repository.status()" })).toEqual({ source: "repository.status()" })
    expect(Object.keys({ loadSkill: LoadSkillTool, executeDsl: ExecuteDslTool })).toEqual(["loadSkill", "executeDsl"])
  })
})

describe("scripted one-turn model", () => {
  // @effect-diagnostics-next-line asyncFunction:off
  it("settles scripted tool calls in order and advances turns", async () => {
    const seen: Array<string> = []
    const layer = scriptedModelLayer([
      { _tag: "Success", text: "working", toolCalls: [
        { name: "loadSkill", input: { name: "review" } },
        { name: "executeDsl", input: { source: "repository.status()" } },
      ] },
      { _tag: "Success", text: "done", finishReason: "stop" },
    ], {
      loadSkill: (name) => Effect.sync(() => { seen.push(`skill:${name}`); return "instructions" }),
      executeDsl: (source) => Effect.sync(() => { seen.push(`dsl:${source}`); return "clean" }),
    })
    // A test entry point intentionally provides the complete fake model Layer.
    // @effect-diagnostics-next-line strictEffectProvide:off
    const run = Effect.gen(function*() {
      const model = yield* OneTurnModel
      const first = yield* model.generate({ instructions: "test", context: [] })
      const second = yield* model.generate({ instructions: "test", context: [] })
      return { first, second }
    }).pipe(Effect.provide(layer))
    const result = await Effect.runPromise(run)
    expect(seen).toEqual(["skill:review", "dsl:repository.status()"])
    expect(result.first.toolCalls.map((call) => call.result)).toEqual(["instructions", "clean"])
    expect(result.second.text).toBe("done")
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("reproduces model failures and script exhaustion", async () => {
    const layer = scriptedModelLayer([{ _tag: "Failure", message: "provider unavailable" }], {
      loadSkill: () => Effect.succeed(""), executeDsl: () => Effect.succeed(""),
    })
    // A test entry point intentionally provides the complete fake model Layer.
    // @effect-diagnostics-next-line strictEffectProvide:off
    const invoke = Effect.gen(function*() {
      return yield* (yield* OneTurnModel).generate({ instructions: "", context: [] })
    }).pipe(Effect.provide(layer))
    await expect(Effect.runPromise(invoke)).rejects.toBeInstanceOf(ModelTurnFailure)
    await expect(Effect.runPromise(invoke)).rejects.toBeInstanceOf(ModelTurnFailure)
  })
})
