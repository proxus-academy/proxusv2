import { Schema } from "effect"
import { SkillId, makeSkillId } from "../ids.js"

export interface SkillDescriptor<Id extends string = string> {
  readonly id: Id & SkillId
  readonly description: string
}

export const defineSkill = <const Id extends string>(descriptor: {
  readonly id: Id
  readonly description: string
}): SkillDescriptor<Id> => Object.freeze({
  ...descriptor,
  id: makeSkillId(descriptor.id) as Id & SkillId,
  description: Schema.decodeUnknownSync(Schema.NonEmptyString)(descriptor.description),
})

export const Skill = { define: defineSkill } as const

export class SkillContent extends Schema.Class<SkillContent>(
  "@proxus/agent-harness/SkillContent",
)({
  id: SkillId,
  description: Schema.NonEmptyString,
  instructions: Schema.NonEmptyString,
  references: Schema.Array(Schema.NonEmptyString),
}) {}

export const LoadedSkill = Schema.Struct({
  content: SkillContent,
  contentHash: Schema.NonEmptyString,
})
export type LoadedSkill = typeof LoadedSkill.Type
