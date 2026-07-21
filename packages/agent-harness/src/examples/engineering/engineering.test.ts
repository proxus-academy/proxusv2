// @effect-diagnostics asyncFunction:off effectSucceedWithVoid:off strictEffectProvide:off
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { compileDsl, DslRuntime, OperationApproval, OperationDenied, OperationPolicy, type OperationContext } from "../../dsl/index.js"
import { makeAgentId, makeRunId } from "../../ids.js"
import { GitHubPublisher, GitHubReader, LocalGit, RepositoryWorkspace, ValidationCapability } from "./capabilities.js"
import { EngineeringDsl } from "./definition.js"
import { engineeringHandlersLayer } from "./handlers.js"

const sha = "a".repeat(40)
const context: OperationContext = { runId: makeRunId("10000000-0000-4000-8000-000000000011"), agentId: makeAgentId("engineering"), actorId: "actor", tenantId: "tenant", variables: { get: () => Effect.succeed(undefined), require: () => Effect.die("unused") }, delegatedAuthority: ["repository:read", "github:publish"] }
const policyLayer = Layer.succeed(OperationPolicy, OperationPolicy.of({ authorize: ({ context, operation }) => Effect.succeed(context.delegatedAuthority.includes(operation.kind === "query" ? "repository:read" : "github:publish") ? { _tag: "Allowed", requiresApproval: false } : { _tag: "Denied", reason: "missing permission" }) }))
const approvalLayer = Layer.succeed(OperationApproval, OperationApproval.of({ verify: () => Effect.void }))

const capabilities = (calls: Array<unknown>, secret = "ghs_DO_NOT_LEAK") => Layer.mergeAll(
  Layer.succeed(GitHubReader, GitHubReader.of({ inspectIssue: (ref) => { calls.push(ref); return Effect.succeed({ number: ref.number, title: "Issue", body: "Body", state: "open", url: "https://github.test/i/7", credential: secret } as any) }, reviewPullRequest: (ref) => Effect.succeed({ number: ref.number, title: "PR", body: "Body", baseSha: sha, headSha: sha, files: ["src/a.ts"] }) })),
  Layer.succeed(RepositoryWorkspace, RepositoryWorkspace.of({ search: (request) => { calls.push(request); return Effect.succeed([{ path: "src/a.ts", line: 1, excerpt: "needle" }]) }, read: () => Effect.succeed({ text: "file", truncated: false }), status: () => Effect.succeed({ branch: "main", headSha: sha, changedPaths: [] }), diff: () => Effect.succeed({ text: "diff", truncated: false }), applyPatch: () => Effect.succeed({ changedPaths: ["src/a.ts"] }) })),
  Layer.succeed(ValidationCapability, ValidationCapability.of({ discover: () => Effect.succeed([{ id: "test", description: "tests" }]), run: ({ id }) => Effect.succeed({ id: "run-1", name: id, status: "passed", exitCode: 0 }), output: () => Effect.succeed({ text: "ok", truncated: false }) })),
  Layer.succeed(LocalGit, LocalGit.of({ createBranch: ({ name }) => Effect.succeed({ branch: name, headSha: sha }), commit: () => Effect.succeed({ sha, branch: "work" }) })),
  Layer.succeed(GitHubPublisher, GitHubPublisher.of({ push: (request) => { calls.push(request); return Effect.succeed({ headSha: sha }) }, createPullRequest: () => Effect.succeed({ number: 1, url: "https://github.test/pr/1" }), comment: () => Effect.succeed({ url: "https://github.test/comment/1" }), submitReview: () => Effect.succeed({ url: "https://github.test/review/1" }) })),
)
const runtime = (calls: Array<unknown>) => engineeringHandlersLayer.pipe(Layer.provide(capabilities(calls)), Layer.merge(policyLayer), Layer.merge(approvalLayer))
const execute = (source: string, calls: Array<unknown> = []) => Effect.runPromise(DslRuntime.execute(EngineeringDsl, source, context).pipe(Effect.provide(runtime(calls))))

describe("EngineeringDsl", () => {
  it("declares every required stable capability operation", () => {
    const ids = Object.values(EngineeringDsl.contexts).flatMap((c) => Object.values(c.methods)).filter((m) => m.kind === "operation").map((m) => m.id).sort()
    expect(ids).toEqual(["git.branch", "git.commit", "github.issue.inspect", "github.publish.comment", "github.publish.pull-request", "github.publish.push", "github.publish.review", "github.pull-request.review", "repository.apply-patch", "repository.diff", "repository.read", "repository.search", "repository.status", "validation.discover", "validation.output", "validation.run"].sort())
  })

  it("passes validated contextual repository and issue arguments to the host reader and strips undeclared credential fields", async () => {
    const calls: Array<unknown> = []
    const result = await execute('github.repository({"owner":"proxus","name":"app"}).issue({"number":7}).inspect()', calls)
    expect(calls).toEqual([{ owner: "proxus", name: "app", number: 7 }])
    expect(JSON.stringify(result)).not.toContain("ghs_DO_NOT_LEAK")
    expect(result.value).toEqual({ number: 7, title: "Issue", body: "Body", state: "open", url: "https://github.test/i/7" })
  })

  it.each([
    ['repository.read({"path":"../secret"})', "INVALID_ARGUMENT"],
    ['repository.read({"path":"/etc/passwd"})', "INVALID_ARGUMENT"],
    ['repository.search({"query":"x","paths":[],"maxResults":999})', "INVALID_ARGUMENT"],
    ['validation.run({"id":"test","timeoutMs":999})', "INVALID_ARGUMENT"],
    [`git.branch({"name":"work","expectedHeadSha":"bad"})`, "INVALID_ARGUMENT"],
    [`github.repository({"owner":"o","name":"r"}).comment({"subject":"issue","number":1,"body":"${"x".repeat(65_537)}"})`, "SOURCE_TOO_LONG"],
  ])("rejects constrained input %s", (source, code) => {
    expect(() => compileDsl(EngineeringDsl, source)).toThrowError(expect.objectContaining({ code }))
  })

  it("fails closed on permission before invoking a publish capability", async () => {
    const calls: Array<unknown> = []
    const denied = { ...context, delegatedAuthority: ["repository:read"] }
    const effect = DslRuntime.execute(EngineeringDsl, `github.repository({"owner":"o","name":"r"}).push({"branch":"work","expectedBaseSha":"${sha}","expectedHeadSha":"${sha}","diffHash":"sha256:${"a".repeat(64)}"})`, denied).pipe(Effect.provide(runtime(calls)), Effect.flip)
    expect(await Effect.runPromise(effect)).toBeInstanceOf(OperationDenied)
    expect(calls).toEqual([])
  })

  it("marks every external publish operation as mutation plus approval", () => {
    const plans = [
      `github.repository({"owner":"o","name":"r"}).push({"branch":"b","expectedBaseSha":"${sha}","expectedHeadSha":"${sha}","diffHash":"sha256:${"a".repeat(64)}"})`,
      `github.repository({"owner":"o","name":"r"}).createPullRequest({"base":"main","head":"b","title":"t","body":"b","expectedBaseSha":"${sha}","expectedHeadSha":"${sha}","diffHash":"sha256:${"a".repeat(64)}"})`,
      `github.repository({"owner":"o","name":"r"}).comment({"subject":"issue","number":1,"body":"b","expectedHeadSha":"${sha}","diffHash":"sha256:${"a".repeat(64)}"})`,
      `github.repository({"owner":"o","name":"r"}).pullRequest({"number":1}).submitReview({"event":"approve","body":"ok","expectedBaseSha":"${sha}","expectedHeadSha":"${sha}","diffHash":"sha256:${"a".repeat(64)}"})`,
    ].map((source) => compileDsl(EngineeringDsl, source).operations[0]!)
    expect(plans.every((operation) => operation.kind === "mutation" && operation.approval.required)).toBe(true)
  })
})
