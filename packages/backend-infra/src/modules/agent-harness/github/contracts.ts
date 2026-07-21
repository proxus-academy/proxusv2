import { Context, Data, Effect, Redacted } from "effect"

export type GitHubAppRole = "reader" | "writer"
export interface GitHubRepository { readonly owner: string; readonly name: string }
export interface GitHubHttpRequest {
  readonly method: "GET" | "POST"
  readonly path: string
  readonly query?: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string | Redacted.Redacted>>
  readonly body?: unknown
}
export interface GitHubHttpResponse { readonly status: number; readonly body: unknown }

/** Host HTTP seam. Redacted headers must only be revealed by the real transport at dispatch. */
export class GitHubHttpClient extends Context.Service<GitHubHttpClient, {
  readonly request: (request: GitHubHttpRequest) => Effect.Effect<GitHubHttpResponse, GitHubTransportError>
}>()("@proxus/backend-infra/modules/agent-harness/github/contracts/GitHubHttpClient") {}

export class GitHubTransportError extends Data.TaggedError("GitHubTransportError")<{ readonly operation: string }> {}
export class GitHubAccessDenied extends Data.TaggedError("GitHubAccessDenied")<{ readonly operation: string; readonly resource: string; readonly message?: string }> {}
export class GitHubConflict extends Data.TaggedError("GitHubConflict")<{ readonly operation: string; readonly expectedSha: string; readonly actualSha: string }> {}
export class GitHubNotFound extends Data.TaggedError("GitHubNotFound")<{ readonly resource: string }> {}
export class GitHubRateLimited extends Data.TaggedError("GitHubRateLimited")<{}> {}
export class GitHubUnexpectedResponse extends Data.TaggedError("GitHubUnexpectedResponse")<{ readonly operation: string; readonly status: number }> {}
export type GitHubAdapterError = GitHubTransportError | GitHubAccessDenied | GitHubConflict | GitHubNotFound | GitHubRateLimited | GitHubUnexpectedResponse

export interface InstallationCredential { readonly token: Redacted.Redacted; readonly expiresAt: number }
export class GitHubInstallationCredentials extends Context.Service<GitHubInstallationCredentials, {
  readonly get: () => Effect.Effect<InstallationCredential, GitHubAdapterError>
}>()("@proxus/backend-infra/modules/agent-harness/github/contracts/GitHubInstallationCredentials") {}

/** Push remains host-side: implementations may use a controlled credential helper, never sandbox env. */
export class GitHubPushBroker extends Context.Service<GitHubPushBroker, {
  readonly push: (request: { readonly repository: GitHubRepository; readonly branch: string; readonly expectedBaseSha: string; readonly expectedHeadSha: string; readonly token: Redacted.Redacted }) => Effect.Effect<{ readonly headSha: string }, GitHubAdapterError>
}>()("@proxus/backend-infra/modules/agent-harness/github/contracts/GitHubPushBroker") {}
