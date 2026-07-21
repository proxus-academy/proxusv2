import { Context, Effect } from "effect"

export interface RepositoryRef { readonly owner: string; readonly name: string }
export interface IssueRef extends RepositoryRef { readonly number: number }
export interface PullRequestRef extends RepositoryRef { readonly number: number }
export interface TextArtifact { readonly text: string; readonly truncated: boolean }
export interface RepositoryStatus { readonly branch: string; readonly headSha: string; readonly changedPaths: ReadonlyArray<string> }
export interface ValidationRun { readonly id: string; readonly name: string; readonly status: "passed" | "failed"; readonly exitCode: number }

/** Host-side reader. Implementations own credentials; requests and results deliberately cannot carry them. */
export class GitHubReader extends Context.Service<GitHubReader, {
  readonly inspectIssue: (ref: IssueRef) => Effect.Effect<{ readonly number: number; readonly title: string; readonly body: string; readonly state: "open" | "closed"; readonly url: string }, Error>
  readonly reviewPullRequest: (ref: PullRequestRef) => Effect.Effect<{ readonly number: number; readonly title: string; readonly body: string; readonly baseSha: string; readonly headSha: string; readonly files: ReadonlyArray<string> }, Error>
}>()("@proxus/agent-harness/examples/engineering/capabilities/GitHubReader") {}

/** Workspace capability. Paths are repository-relative and implementations must confine them. */
export class RepositoryWorkspace extends Context.Service<RepositoryWorkspace, {
  readonly search: (request: { readonly query: string; readonly paths: ReadonlyArray<string>; readonly maxResults: number }) => Effect.Effect<ReadonlyArray<{ readonly path: string; readonly line: number; readonly excerpt: string }>, Error>
  readonly read: (request: { readonly path: string; readonly startLine?: number; readonly endLine?: number }) => Effect.Effect<TextArtifact, Error>
  readonly status: () => Effect.Effect<RepositoryStatus, Error>
  readonly diff: (request: { readonly paths: ReadonlyArray<string> }) => Effect.Effect<TextArtifact, Error>
  readonly applyPatch: (request: { readonly patch: string }) => Effect.Effect<{ readonly changedPaths: ReadonlyArray<string> }, Error>
}>()("@proxus/agent-harness/examples/engineering/capabilities/RepositoryWorkspace") {}

export class ValidationCapability extends Context.Service<ValidationCapability, {
  readonly discover: () => Effect.Effect<ReadonlyArray<{ readonly id: string; readonly description: string }>, Error>
  readonly run: (request: { readonly id: string; readonly timeoutMs: number }) => Effect.Effect<ValidationRun, Error>
  readonly output: (request: { readonly runId: string }) => Effect.Effect<TextArtifact, Error>
}>()("@proxus/agent-harness/examples/engineering/capabilities/ValidationCapability") {}

export class LocalGit extends Context.Service<LocalGit, {
  readonly createBranch: (request: { readonly name: string; readonly expectedHeadSha: string }) => Effect.Effect<{ readonly branch: string; readonly headSha: string }, Error>
  readonly commit: (request: { readonly message: string; readonly paths: ReadonlyArray<string> }) => Effect.Effect<{ readonly sha: string; readonly branch: string }, Error>
}>()("@proxus/agent-harness/examples/engineering/capabilities/LocalGit") {}

/** Consequential host-side broker seam. Step 11 declares calls only; credential/App adapters belong to step 12. */
export class GitHubPublisher extends Context.Service<GitHubPublisher, {
  readonly push: (request: { readonly repository: RepositoryRef; readonly branch: string; readonly expectedBaseSha: string; readonly expectedHeadSha: string; readonly diffHash: string }) => Effect.Effect<{ readonly headSha: string }, Error>
  readonly createPullRequest: (request: { readonly repository: RepositoryRef; readonly base: string; readonly head: string; readonly title: string; readonly body: string; readonly expectedBaseSha: string; readonly expectedHeadSha: string; readonly diffHash: string }) => Effect.Effect<{ readonly number: number; readonly url: string }, Error>
  readonly comment: (request: { readonly repository: RepositoryRef; readonly subject: "issue" | "pull-request"; readonly number: number; readonly body: string; readonly expectedHeadSha: string; readonly diffHash: string }) => Effect.Effect<{ readonly url: string }, Error>
  readonly submitReview: (request: { readonly repository: RepositoryRef; readonly number: number; readonly event: "approve" | "request-changes" | "comment"; readonly body: string; readonly expectedBaseSha: string; readonly expectedHeadSha: string; readonly diffHash: string }) => Effect.Effect<{ readonly url: string }, Error>
}>()("@proxus/agent-harness/examples/engineering/capabilities/GitHubPublisher") {}
