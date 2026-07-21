import { Context, Data, Effect, Layer, Schema } from "effect"
import type { SkillId } from "../ids.js"
import type { SkillDescriptor } from "./skill.js"
import { LoadedSkill, SkillContent } from "./skill.js"

export class SkillLoadNotAllowed extends Data.TaggedError("SkillLoadNotAllowed")<{ readonly name: string }> {}
export class SkillLoadNotFound extends Data.TaggedError("SkillLoadNotFound")<{ readonly name: string }> {}
export class SkillContentInvalid extends Data.TaggedError("SkillContentInvalid")<{ readonly name: string; readonly message: string }> {}

export interface SkillActivation {
  readonly skillId: SkillId
  readonly contentHash: string
}

export class Skills extends Context.Service<Skills, {
  readonly list: Effect.Effect<ReadonlyArray<SkillDescriptor>>
  readonly load: (name: string) => Effect.Effect<LoadedSkill, SkillLoadNotAllowed | SkillLoadNotFound | SkillContentInvalid>
}>()("@proxus/agent-harness/skills/service/Skills") {}

const hash = (value: unknown): string => {
  const source = JSON.stringify(value)
  let result = 2166136261
  for (let index = 0; index < source.length; index++) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return `fnv1a32:${(result >>> 0).toString(16).padStart(8, "0")}`
}

/** In-memory adapter and the reference semantics for allowlisting and decoding. */
export const inMemorySkillsLayer = (
  allowed: ReadonlyArray<SkillDescriptor>,
  values: Readonly<Record<string, unknown>>,
): Layer.Layer<Skills> => Layer.succeed(Skills, Skills.of({
  list: Effect.succeed(Object.freeze([...allowed])),
  load: (name) => Effect.gen(function*() {
    const descriptor = allowed.find((item) => item.id === name)
    if (descriptor === undefined) return yield* new SkillLoadNotAllowed({ name })
    if (!(name in values)) return yield* new SkillLoadNotFound({ name })
    const content = yield* Schema.decodeUnknownEffect(SkillContent)(values[name]).pipe(
      Effect.mapError((error) => new SkillContentInvalid({ name, message: String(error) })),
    )
    if (content.id !== descriptor.id || content.description !== descriptor.description) {
      return yield* new SkillContentInvalid({ name, message: "Content identity does not match its allowed descriptor" })
    }
    return Schema.decodeUnknownSync(LoadedSkill)({ content, contentHash: hash(content) })
  }),
}))
