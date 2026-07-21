import type { AgentId, SkillId } from "../ids.js"
import { Skill } from "../skills/skill.js"
import { Agent, RunPolicy, type SkillIdsOf } from "./agent-definition.js"
import { DslReference } from "./dsl-reference.js"
import { ModelProfile } from "./model-profile.js"

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends
  (<Type>() => Type extends Right ? 1 : 2) ? true : false
type Assert<Value extends true> = Value

const inspect = Skill.define({
  id: "issue-inspection",
  description: "Inspect an issue",
})
const review = Skill.define({
  id: "pull-request-review",
  description: "Review a pull request",
})
const engineeringDsl = DslReference.define({ id: "engineering", version: 1 })
const codingModel = ModelProfile.define({ id: "coding", })

const engineering = Agent.define({
  id: "engineering",
  prompt: { instructions: "Use repository evidence." },
  skills: [inspect, review] as const,
  dsl: engineeringDsl,
  model: codingModel,
  runPolicy: new RunPolicy({
    maxTurns: 20,
    maxDslExecutions: 30,
    maxOperations: 50,
    maxDelegationDepth: 1,
    maxChildren: 2,
    deadlineMs: 60_000,
    maxOutputBytes: 64_000,
  }),
})

type _AgentLiteralIsPreserved = Assert<
  Equal<typeof engineering.id, "engineering" & AgentId>
>
type _SkillLiteralsArePreserved = Assert<
  Equal<SkillIdsOf<typeof engineering>,
    ("issue-inspection" & SkillId) | ("pull-request-review" & SkillId)>
>
type _DslLiteralIsPreserved = Assert<
  Equal<typeof engineering.dsl.id, "engineering" & import("../ids.js").DslDefinitionId>
>
type _ModelLiteralIsPreserved = Assert<
  Equal<typeof engineering.model.id, "coding" & import("../ids.js").ModelProfileId>
>

// @ts-expect-error an agent must use a declared DSL reference
Agent.define({ ...engineering, dsl: { id: "not-branded", version: 1 } })

// @ts-expect-error run limits require the complete numeric policy shape
Agent.define({ ...engineering, runPolicy: { maxTurns: "unbounded" } })
