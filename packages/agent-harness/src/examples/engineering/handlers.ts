import { Effect, Layer } from "effect"
import { DslRuntime, type HandlerOperationContext } from "../../dsl/index.js"
import { EngineeringDsl } from "./definition.js"
import { GitHubPublisher, GitHubReader, LocalGit, RepositoryWorkspace, ValidationCapability, type RepositoryRef } from "./capabilities.js"

const repository = (context: HandlerOperationContext): RepositoryRef => context.operation.contextInputs[0] as unknown as RepositoryRef
const number = (context: HandlerOperationContext): number => (context.operation.contextInputs[1] as { readonly number: number }).number

/** Production handler declaration: captures only public host capabilities; tokens/env/sandbox are unreachable. */
export const engineeringHandlersLayer = Layer.unwrap(Effect.gen(function*() {
  const reader = yield* GitHubReader
  const workspace = yield* RepositoryWorkspace
  const validation = yield* ValidationCapability
  const git = yield* LocalGit
  const publisher = yield* GitHubPublisher
  return DslRuntime.handlersLayer(EngineeringDsl)({
    "github.issue.inspect": (_input, context) => reader.inspectIssue({ ...repository(context), number: number(context) }),
    "github.pull-request.review": (_input, context) => reader.reviewPullRequest({ ...repository(context), number: number(context) }),
    "repository.search": (input) => workspace.search({ ...input, maxResults: Math.min(input.maxResults ?? 50, 200) }),
    "repository.read": (input) => workspace.read({ path: input.path, ...(input.startLine === undefined ? {} : { startLine: input.startLine }), ...(input.endLine === undefined ? {} : { endLine: input.endLine }) }),
    "repository.status": () => workspace.status(),
    "repository.diff": (input) => workspace.diff(input),
    "repository.apply-patch": (input) => workspace.applyPatch(input),
    "validation.discover": () => validation.discover(),
    "validation.run": (input) => validation.run(input),
    "validation.output": (input) => validation.output(input),
    "git.branch": (input) => git.createBranch(input),
    "git.commit": (input) => git.commit(input),
    "github.publish.push": (input, context) => publisher.push({ repository: repository(context), ...input }),
    "github.publish.pull-request": (input, context) => publisher.createPullRequest({ repository: repository(context), ...input }),
    "github.publish.comment": (input, context) => publisher.comment({ repository: repository(context), ...input }),
    "github.publish.review": (input, context) => publisher.submitReview({ repository: repository(context), number: number(context), ...input }),
  })
}))
