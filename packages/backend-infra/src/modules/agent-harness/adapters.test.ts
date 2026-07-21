// @effect-diagnostics asyncFunction:off strictEffectProvide:off nodeBuiltinImport:off
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ArtifactStore } from "@proxus/agent-harness/store"
import { makeArtifactId, makeRunId } from "@proxus/agent-harness/ids"
import { AgentTelemetry } from "@proxus/agent-harness/observability"
import { SandboxProvider } from "@proxus/agent-harness/sandbox"
import { Skills, Skill } from "@proxus/agent-harness/skills"
import { Effect, Fiber, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { filesystemArtifactStoreLayer } from "./artifacts/filesystem.js"
import { consoleAgentTelemetryLayer } from "./observability/console.js"
import { temporarySandboxLayer } from "./sandbox/temporary/layer.js"
import { filesystemSkillsLayer } from "./skills/filesystem/layer.js"

const runId = makeRunId("00000000-0000-4000-8000-000000000010")
const otherRunId = makeRunId("00000000-0000-4000-8000-000000000011")
const artifactId = makeArtifactId("00000000-0000-4000-8000-000000000012")

describe("agent harness local adapters", () => {
  test("loads only allowlisted filesystem skills and rejects traversal-like names", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "skills-")); mkdirSync(resolve(root, "review")); writeFileSync(resolve(root, "review/SKILL.md"), "---\nid: review\ndescription: Review code\nreferences: docs/review.md\n---\nUse the review DSL.")
    const descriptor = Skill.define({ id: "review", description: "Review code" })
    const loaded = await Effect.runPromise(Effect.gen(function*() { return yield* (yield* Skills).load("review") }).pipe(Effect.provide(filesystemSkillsLayer(root, [descriptor]))))
    expect(loaded.content.instructions).toContain("review DSL")
    const denied = await Effect.runPromise(Effect.gen(function*() { return yield* (yield* Skills).load("../secret").pipe(Effect.flip) }).pipe(Effect.provide(filesystemSkillsLayer(root, [descriptor]))))
    expect(denied._tag).toBe("SkillLoadNotAllowed")
  })

  test("confines paths, cancels processes and cleans its scoped temporary workspace", async () => {
    let workspace = ""
    await Effect.runPromise(Effect.gen(function*() {
      const sandbox = yield* (yield* SandboxProvider).acquire({ network: "denied" }); workspace = sandbox.workspace
      yield* sandbox.writeText("nested/file.txt", "safe")
      expect(yield* sandbox.readText("nested/file.txt")).toBe("safe")
      expect(yield* sandbox.readText("../outside").pipe(Effect.flip)).toBeInstanceOf(Error)
      symlinkSync(tmpdir(), resolve(workspace, "link"))
      expect(yield* sandbox.writeText("link/escape", "bad").pipe(Effect.flip)).toBeInstanceOf(Error)
      const fiber = yield* Effect.forkChild(sandbox.run({ command: "sh", args: ["-c", "sleep 10"] }))
      yield* Effect.sleep("20 millis"); yield* Fiber.interrupt(fiber)
    }).pipe(Effect.provide(temporarySandboxLayer), Effect.scoped))
    expect(existsSync(workspace)).toBe(false)
  })

  test("stores ACL-scoped artifacts and redacts console telemetry", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "artifacts-")); const lines: string[] = []
    await Effect.runPromise(Effect.gen(function*() {
      const artifacts = yield* ArtifactStore
      yield* artifacts.put({ id: artifactId, runId, tenantId: "tenant-a", contentType: "text/plain", bytes: new TextEncoder().encode("report"), createdAt: 1, expiresAt: 10 })
      expect(new TextDecoder().decode(yield* artifacts.get(artifactId, { runId, tenantId: "tenant-a", roles: ["reader"] }))).toBe("report")
      expect(yield* artifacts.get(artifactId, { runId: otherRunId, tenantId: "tenant-a", roles: ["reader"] }).pipe(Effect.flip)).toBeInstanceOf(Error)
      expect(yield* artifacts.removeExpired(20, { tenantId: "tenant-a", roles: ["reader"] }).pipe(Effect.flip)).toBeInstanceOf(Error)
      expect(yield* artifacts.removeExpired(20, { tenantId: "tenant-a", roles: ["retention"] })).toBe(1)
      yield* (yield* AgentTelemetry).emit({ type: "dsl.operation", at: 1, outcome: "failed", operation: "repository.read", annotations: { token: "secret", prompt: "raw customer prompt", "dsl.operation": "repository.read" } as never })
    }).pipe(Effect.provide(Layer.merge(filesystemArtifactStoreLayer(root), consoleAgentTelemetryLayer((line) => lines.push(line))))))
    expect(lines[0]).not.toContain("secret"); expect(lines[0]).not.toContain("raw customer prompt"); expect(lines[0]).toContain("repository.read")
  })
})
