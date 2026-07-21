import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Skill } from "./skill.js"
import { SkillContentInvalid, SkillLoadNotAllowed, Skills, inMemorySkillsLayer } from "./service.js"

const Review = Skill.define({ id: "review", description: "Review changes" })
const content = { id: "review", description: "Review changes", instructions: "Inspect evidence first.", references: ["docs/review.md"] }

const load = (name: string, values: Readonly<Record<string, unknown>> = { review: content }) => {
  // A test entry point intentionally provides the complete in-memory Layer.
  // @effect-diagnostics-next-line strictEffectProvide:off
  const program = Effect.gen(function*() {
    return yield* (yield* Skills).load(name)
  }).pipe(Effect.provide(inMemorySkillsLayer([Review], values)))
  return Effect.runPromiseExit(program)
}

describe("Skills", () => {
  // @effect-diagnostics-next-line asyncFunction:off
  it("lists only the agent allowlist and loads decoded matching content", async () => {
    const layer = inMemorySkillsLayer([Review], { review: content, hidden: { ...content, id: "hidden" } })
    // A test entry point intentionally provides the complete in-memory Layer.
    // @effect-diagnostics-next-line strictEffectProvide:off
    const program = Effect.gen(function*() {
      const skills = yield* Skills
      return { listed: yield* skills.list, loaded: yield* skills.load("review") }
    }).pipe(Effect.provide(layer))
    const result = await Effect.runPromise(program)
    expect(result.listed).toEqual([Review])
    expect(result.loaded.content.instructions).toBe("Inspect evidence first.")
    expect(result.loaded.contentHash).toMatch(/^fnv1a32:/)
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("rejects unlisted skills before looking at available content", async () => {
    const exit = await load("hidden", { hidden: { ...content, id: "hidden" } })
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(String(exit.cause)).toContain("hidden")
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("produces stable hashes and rejects descriptor/content drift", async () => {
    const first = await load("review")
    const second = await load("review")
    if (first._tag === "Success" && second._tag === "Success") expect(first.value.contentHash).toBe(second.value.contentHash)
    const invalid = await load("review", { review: { ...content, description: "Changed" } })
    expect(invalid._tag).toBe("Failure")
    if (invalid._tag === "Failure") expect(String(invalid.cause)).toContain("Content identity")
  })
})
