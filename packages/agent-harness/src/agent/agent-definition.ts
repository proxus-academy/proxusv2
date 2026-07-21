import { Schema } from "effect"
import { makeAgentId, type AgentId } from "../ids.js"
import type { SkillDescriptor } from "../skills/skill.js"
import type { DslReference } from "./dsl-reference.js"
import type { ModelProfile } from "./model-profile.js"

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export class RunPolicy extends Schema.Class<RunPolicy>(
  "@proxus/agent-harness/RunPolicy",
)({
  maxTurns: PositiveInt,
  maxDslExecutions: PositiveInt,
  maxOperations: PositiveInt,
  maxDelegationDepth: NonNegativeInt,
  maxChildren: NonNegativeInt,
  deadlineMs: PositiveInt,
  maxOutputBytes: PositiveInt,
}) {}

export interface AgentDefinition<
  Id extends string = string,
  Skills extends ReadonlyArray<SkillDescriptor> = ReadonlyArray<SkillDescriptor>,
  Dsl extends DslReference = DslReference,
  Model extends ModelProfile = ModelProfile,
> {
  readonly id: Id & AgentId
  readonly prompt: { readonly instructions: string }
  readonly skills: Skills
  readonly dsl: Dsl
  readonly model: Model
  readonly runPolicy: RunPolicy
}

export const defineAgent = <
  const Id extends string,
  const Skills extends ReadonlyArray<SkillDescriptor>,
  const Dsl extends DslReference,
  const Model extends ModelProfile,
>(input: {
  readonly id: Id
  readonly prompt: { readonly instructions: string }
  readonly skills: Skills
  readonly dsl: Dsl
  readonly model: Model
  readonly runPolicy: RunPolicy
}): AgentDefinition<Id, Skills, Dsl, Model> => Object.freeze({
  ...input,
  id: makeAgentId(input.id) as Id & AgentId,
  prompt: Object.freeze({
    instructions: Schema.decodeUnknownSync(Schema.NonEmptyString)(
      input.prompt.instructions,
    ),
  }),
  skills: Object.freeze([...input.skills]) as unknown as Skills,
})

export const Agent = { define: defineAgent } as const

export type SkillIdsOf<Definition extends AgentDefinition> =
  Definition["skills"][number]["id"]
