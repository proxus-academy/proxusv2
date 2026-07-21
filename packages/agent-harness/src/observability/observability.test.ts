import { describe, expect, it } from "vitest"
import { makeArtifactId, makeRunId } from "../ids.js"
import { emptyUsage, type RunRecord } from "../run/model.js"
import { planRetentionCleanup, projectRunInspector, safeJournalSummary, type InspectorFact } from "./index.js"
const limits = { maxTurns: 3, maxDslExecutions: 3, maxOperations: 3, maxInputTokens: 10, maxOutputTokens: 10, maxOutputBytes: 100, deadlineMs: 1000, maxChildren: 1 }
const parentId = makeRunId("10000000-0000-4000-8000-000000000001")
const childId = makeRunId("10000000-0000-4000-8000-000000000002")
const run = (id: typeof parentId, extra: Partial<RunRecord> = {}): RunRecord => ({ id, status: "Succeeded", version: 1, startedAt: 1, deadlineAt: 1001, limits, usage: emptyUsage(), context: [{ role: "user", content: "RAW PROMPT secret=abc" }], output: "RAW ANSWER", cancellationRequested: false, ...extra })
describe("run inspector projection", () => {
  it("projects safe facts and stable parent/child linkage without raw run text", () => {
    const artifactId = makeArtifactId("20000000-0000-4000-8000-000000000001")
    const facts = new Map([[parentId, [{ type: "objective", value: "Investigate issue 42", at: 1 }, { type: "operation", value: "github.issue.inspect", at: 2 }, { type: "artifact", value: "validation report", artifactId, at: 3 }, { type: "answer", value: "Validation passed", at: 4 }] satisfies ReadonlyArray<InspectorFact>]])
    const projected = projectRunInspector(parentId, [run(childId, { parentRunId: parentId, parentStepId: "delegate-1", startedAt: 2 }), run(parentId)], facts)!
    expect(projected.operations).toEqual(["github.issue.inspect"])
    expect(projected.children[0]).toMatchObject({ runId: childId, parentRunId: parentId, parentStepId: "delegate-1" })
    expect(projected.artifacts).toEqual([{ id: artifactId, label: "validation report" }])
    expect(JSON.stringify(projected)).not.toMatch(/RAW PROMPT|RAW ANSWER|secret=abc/)
  })
  it("strips journal detail while retaining linkage", () => {
    const summary = safeJournalSummary([{ sequence: 1, type: "ChildRunStarted", at: 1, detail: "prompt and ghp_secret", childRunId: childId, parentRunId: parentId, parentStepId: "step" }])
    expect(JSON.stringify(summary)).not.toContain("ghp_secret")
    expect(summary[0]).toMatchObject({ childRunId: childId, parentRunId: parentId })
  })
  it("cleans only expired terminal data with separate retention windows", () => {
    expect(planRetentionCleanup(100, { artifactsMs: 10, journalMs: 50 }, [{ kind: "artifact", id: "a", createdAt: 89, terminal: true }, { kind: "journal", id: "j", createdAt: 49, terminal: true }, { kind: "artifact", id: "active", createdAt: 0, terminal: false }]).map((x) => x.id)).toEqual(["a", "j"])
  })
})
