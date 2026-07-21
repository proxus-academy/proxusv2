import { Effect } from "effect"
import type { DslDefinition } from "../dsl/definition.js"
import { DslHandlers, OperationApproval, OperationPolicy, executeDsl, type OperationContext } from "../dsl/runtime.js"
import { renderDslValue, type RenderOptions } from "../dsl/renderer.js"
import { Skills, type SkillActivation } from "../skills/service.js"
import type { HarnessToolHandlers } from "./model-turn.js"

export interface HarnessToolHandlerOptions<D extends DslDefinition> {
  readonly definition: D
  readonly operationContext: OperationContext
  readonly onSkillActivated?: (activation: SkillActivation) => Effect.Effect<void>
  readonly render?: RenderOptions
}

/** Binds the tiny model surface to the current agent. Loading instructions never changes DSL or policy. */
export const makeHarnessToolHandlers = <D extends DslDefinition>(options: HarnessToolHandlerOptions<D>): Effect.Effect<HarnessToolHandlers, never, Skills | DslHandlers | OperationPolicy | OperationApproval> =>
  Effect.gen(function*() {
    const skills = yield* Skills
    return {
      loadSkill: (name: string) => skills.load(name).pipe(
        Effect.tap((loaded) => options.onSkillActivated?.({ skillId: loaded.content.id, contentHash: loaded.contentHash }) ?? Effect.void),
        Effect.map((loaded) => loaded.content.instructions + (loaded.content.references.length === 0 ? "" : `\n\nReferences:\n${loaded.content.references.map((item) => `- ${item}`).join("\n")}`)),
        Effect.catch((error) => Effect.succeed(JSON.stringify({ error: error._tag, message: "Skill cannot be loaded", name }))),
      ),
      executeDsl: (source: string) => executeDsl(options.definition, source, options.operationContext).pipe(
        Effect.map((result) => renderDslValue(result.value, options.render).text),
        Effect.catch((error) => Effect.succeed(JSON.stringify({ error: "_tag" in error ? error._tag : "DslExecutionError", message: String(error.message) }))),
      ),
    }
  }) as any
