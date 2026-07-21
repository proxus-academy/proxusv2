// @effect-diagnostics nodeBuiltinImport:off strictBooleanExpressions:off globalErrorInEffectCatch:off globalErrorInEffectFailure:off anyUnknownInErrorContext:off preferSchemaOverJson:off
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { Skills, SkillContentInvalid, SkillLoadNotAllowed, SkillLoadNotFound, type SkillDescriptor } from "@proxus/agent-harness/skills"
import { Effect, Layer, Schema } from "effect"
import { LoadedSkill, SkillContent } from "@proxus/agent-harness/skills"

const confined = (root: string, child: string): string => {
  const base = resolve(root)
  const target = resolve(base, child)
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error("Skill path escapes configured directory")
  return target
}

const parse = (name: string, source: string): unknown => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u.exec(source)
  if (!match) throw new SkillContentInvalid({ name, message: "SKILL.md must contain YAML-style frontmatter" })
  const metadata = Object.fromEntries(match[1]!.split(/\r?\n/u).filter(Boolean).map((line) => {
    const index = line.indexOf(":")
    if (index < 1) throw new SkillContentInvalid({ name, message: `Invalid frontmatter line: ${line}` })
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
  }))
  return { id: metadata.id, description: metadata.description, instructions: match[2]!.trim(), references: metadata.references ? metadata.references.split(",").map((value) => value.trim()) : [] }
}

export const filesystemSkillsLayer = (root: string, allowed: ReadonlyArray<SkillDescriptor>): Layer.Layer<Skills> => Layer.succeed(Skills, Skills.of({
  list: Effect.succeed(Object.freeze([...allowed])),
  load: (name) => Effect.gen(function*() {
    const descriptor = allowed.find((item) => item.id === name)
    if (!descriptor) return yield* new SkillLoadNotAllowed({ name })
    const filename = confined(root, `${name}/SKILL.md`)
    const source = yield* Effect.tryPromise({ try: () => readFile(filename, "utf8"), catch: () => new SkillLoadNotFound({ name }) })
    const content = yield* Effect.try({ try: () => parse(name, source), catch: (error) => error instanceof SkillContentInvalid ? error : new SkillContentInvalid({ name, message: String(error) }) }).pipe(
      Effect.flatMap((value) => Schema.decodeUnknownEffect(SkillContent)(value)),
      Effect.mapError((error) => error instanceof SkillContentInvalid ? error : new SkillContentInvalid({ name, message: String(error) })),
    )
    if (content.id !== descriptor.id || content.description !== descriptor.description) return yield* new SkillContentInvalid({ name, message: "Content identity does not match its allowed descriptor" })
    return Schema.decodeUnknownSync(LoadedSkill)({ content, contentHash: `sha256:${createHash("sha256").update(JSON.stringify(content)).digest("hex")}` })
  }),
}))
