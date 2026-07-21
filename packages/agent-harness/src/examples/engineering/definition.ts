import { Schema } from "effect"
import { Dsl } from "../../dsl/index.js"

const bounded = (max: number) => Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(max)))
const Owner = bounded(100).pipe(Schema.check(Schema.makeFilter<string>((value) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(value) ? undefined : "invalid owner")))
const Repo = bounded(100).pipe(Schema.check(Schema.makeFilter<string>((value) => /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== ".." ? undefined : "invalid repository")))
const RelativePath = bounded(512).pipe(Schema.check(Schema.makeFilter<string>((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").some((part) => part === "" || part === "." || part === "..") && value !== ".git" && !value.startsWith(".git/") ? undefined : "path must be confined")))
const Sha = Schema.String.pipe(Schema.check(Schema.makeFilter<string>((value) => /^[0-9a-f]{40}$/.test(value) ? undefined : "invalid SHA")))
const DiffHash = Schema.String.pipe(Schema.check(Schema.makeFilter<string>((value) => /^sha256:[0-9a-f]{64}$/.test(value) ? undefined : "invalid diff hash")))
const PositiveNumber = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })))
const MaxResults = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 200 })))
const Paths = Schema.Array(RelativePath).pipe(Schema.check(Schema.isMaxLength(64)))
const RepositoryRef = Schema.Struct({ owner: Owner, name: Repo })
const TextArtifact = Schema.Struct({ text: Schema.String.pipe(Schema.check(Schema.isMaxLength(131_072))), truncated: Schema.Boolean })
const Url = bounded(2_048).pipe(Schema.check(Schema.makeFilter<string>((value) => value.startsWith("https://") ? undefined : "HTTPS URL required")))
const approval = (reason: string) => ({ required: true, reason }) as const

export const EngineeringDsl = Dsl.define({
  id: "engineering",
  version: 1,
  roots: { github: "github", repository: "repository", validation: "validation", git: "git" },
  contexts: {
    github: { methods: { repository: Dsl.transition(RepositoryRef, "githubRepository") } },
    githubRepository: { methods: {
      issue: Dsl.transition(Schema.Struct({ number: PositiveNumber }), "githubIssue"),
      pullRequest: Dsl.transition(Schema.Struct({ number: PositiveNumber }), "githubPullRequest"),
      push: Dsl.operation(Schema.Struct({ branch: bounded(200), expectedBaseSha: Sha, expectedHeadSha: Sha, diffHash: DiffHash }), Schema.Struct({ headSha: Sha }), { id: "github.publish.push", kind: "mutation", approval: approval("Push local commits") }),
      createPullRequest: Dsl.operation(Schema.Struct({ base: bounded(200), head: bounded(200), title: bounded(256), body: bounded(65_536), expectedBaseSha: Sha, expectedHeadSha: Sha, diffHash: DiffHash }), Schema.Struct({ number: PositiveNumber, url: Url }), { id: "github.publish.pull-request", kind: "mutation", approval: approval("Create a pull request") }),
      comment: Dsl.operation(Schema.Struct({ subject: Schema.Literals(["issue", "pull-request"]), number: PositiveNumber, body: bounded(65_536), expectedHeadSha: Sha, diffHash: DiffHash }), Schema.Struct({ url: Url }), { id: "github.publish.comment", kind: "mutation", approval: approval("Publish a GitHub comment") }),
    } },
    githubIssue: { methods: { inspect: Dsl.operation(Schema.Undefined, Schema.Struct({ number: PositiveNumber, title: bounded(256), body: Schema.String.pipe(Schema.check(Schema.isMaxLength(65_536))), state: Schema.Literals(["open", "closed"]), url: Url }), { id: "github.issue.inspect" }) } },
    githubPullRequest: { methods: {
      review: Dsl.operation(Schema.Undefined, Schema.Struct({ number: PositiveNumber, title: bounded(256), body: Schema.String.pipe(Schema.check(Schema.isMaxLength(65_536))), baseSha: Sha, headSha: Sha, files: Paths }), { id: "github.pull-request.review" }),
      submitReview: Dsl.operation(Schema.Struct({ event: Schema.Literals(["approve", "request-changes", "comment"]), body: bounded(65_536), expectedBaseSha: Sha, expectedHeadSha: Sha, diffHash: DiffHash }), Schema.Struct({ url: Url }), { id: "github.publish.review", kind: "mutation", approval: approval("Submit a pull request review") }),
    } },
    repository: { methods: {
      search: Dsl.operation(Schema.Struct({ query: bounded(500), paths: Paths, maxResults: Schema.optional(MaxResults) }), Schema.Array(Schema.Struct({ path: RelativePath, line: PositiveNumber, excerpt: Schema.String.pipe(Schema.check(Schema.isMaxLength(2_000))) })).pipe(Schema.check(Schema.isMaxLength(200))), { id: "repository.search" }),
      read: Dsl.operation(Schema.Struct({ path: RelativePath, startLine: Schema.optional(PositiveNumber), endLine: Schema.optional(PositiveNumber) }), TextArtifact, { id: "repository.read" }),
      status: Dsl.operation(Schema.Undefined, Schema.Struct({ branch: bounded(200), headSha: Sha, changedPaths: Paths }), { id: "repository.status" }),
      diff: Dsl.operation(Schema.Struct({ paths: Paths }), TextArtifact, { id: "repository.diff" }),
      applyPatch: Dsl.operation(Schema.Struct({ patch: bounded(262_144) }), Schema.Struct({ changedPaths: Paths }), { id: "repository.apply-patch", kind: "mutation" }),
    } },
    validation: { methods: {
      discover: Dsl.operation(Schema.Undefined, Schema.Array(Schema.Struct({ id: bounded(100), description: bounded(500) })).pipe(Schema.check(Schema.isMaxLength(100))), { id: "validation.discover" }),
      run: Dsl.operation(Schema.Struct({ id: bounded(100), timeoutMs: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1_000, maximum: 900_000 }))) }), Schema.Struct({ id: bounded(100), name: bounded(200), status: Schema.Literals(["passed", "failed"]), exitCode: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 255 }))) }), { id: "validation.run", kind: "mutation" }),
      output: Dsl.operation(Schema.Struct({ runId: bounded(100) }), TextArtifact, { id: "validation.output" }),
    } },
    git: { methods: {
      branch: Dsl.operation(Schema.Struct({ name: bounded(200), expectedHeadSha: Sha }), Schema.Struct({ branch: bounded(200), headSha: Sha }), { id: "git.branch", kind: "mutation" }),
      commit: Dsl.operation(Schema.Struct({ message: bounded(500), paths: Paths }), Schema.Struct({ sha: Sha, branch: bounded(200) }), { id: "git.commit", kind: "mutation" }),
    } },
  },
})
