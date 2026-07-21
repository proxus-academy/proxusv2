import { createSign } from "node:crypto"
import { Clock, Effect, Layer, Redacted } from "effect"
import { GitHubPublisher, GitHubReader, type RepositoryRef } from "@proxus/agent-harness/examples/engineering"
import { OperationPolicy, type PolicyDecision } from "@proxus/agent-harness/dsl"
import type { GitHubAppSettings } from "./config.js"
import { GitHubAccessDenied, GitHubConflict, GitHubHttpClient, GitHubInstallationCredentials, GitHubNotFound, GitHubPushBroker, GitHubRateLimited, GitHubUnexpectedResponse, type GitHubAdapterError, type GitHubHttpResponse, type GitHubRepository } from "./contracts.js"

const encode = encodeURIComponent
const repoKey = (repository: GitHubRepository) => `${repository.owner}/${repository.name}`
const hasRepo = (config: GitHubAppSettings, repository: GitHubRepository) => config.repositories.has(repoKey(repository))
const requireScope = (config: GitHubAppSettings, repository: GitHubRepository, permission: string, operation: string) => hasRepo(config, repository) && config.permissions.has(permission)
  ? Effect.void
  : Effect.fail(new GitHubAccessDenied({ operation, resource: repoKey(repository) }))

const mapStatus = (operation: string, response: GitHubHttpResponse): Effect.Effect<GitHubHttpResponse, GitHubAdapterError> => {
  if (response.status >= 200 && response.status < 300) return Effect.succeed(response)
  if (response.status === 401 || response.status === 403) return Effect.fail(new GitHubAccessDenied({ operation, resource: "installation" }))
  if (response.status === 404) return Effect.fail(new GitHubNotFound({ resource: operation }))
  if (response.status === 429) return Effect.fail(new GitHubRateLimited())
  return Effect.fail(new GitHubUnexpectedResponse({ operation, status: response.status }))
}
const object = (value: unknown): Record<string, any> => value !== null && typeof value === "object" ? value as Record<string, any> : {}
const array = (value: unknown): ReadonlyArray<any> => Array.isArray(value) ? value : []
const bearer = (token: Redacted.Redacted) => Redacted.make(`Bearer ${Redacted.value(token)}`)
const headers = (token: Redacted.Redacted) => ({ authorization: bearer(token), accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" })
const marker = (key: string) => `<!-- proxus-idempotency:${key} -->`

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")
const appJwt = (config: GitHubAppSettings, now: number): Redacted.Redacted => {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(JSON.stringify({ iat: Math.floor(now / 1000) - 30, exp: Math.floor(now / 1000) + 540, iss: config.appId }))
  const unsigned = `${header}.${payload}`
  const signature = createSign("RSA-SHA256").update(unsigned).sign(Redacted.value(config.privateKey))
  return Redacted.make(`${unsigned}.${base64url(signature)}`)
}

/** Cached short-lived installation token. The redacted token is only unwrapped by the HTTP/push host seams. */
export const installationCredentialsLayer = (config: GitHubAppSettings): Layer.Layer<GitHubInstallationCredentials, never, GitHubHttpClient> => Layer.effect(GitHubInstallationCredentials, Effect.gen(function*() {
  const http = yield* GitHubHttpClient
  let cached: { readonly token: Redacted.Redacted; readonly expiresAt: number } | undefined
  return GitHubInstallationCredentials.of({ get: Effect.fn("GitHubInstallationCredentials.get")(function*() {
    const now = yield* Clock.currentTimeMillis
    if (cached !== undefined && cached.expiresAt - now > 60_000) return cached
    const response = yield* http.request({ method: "POST", path: `/app/installations/${encode(config.installationId)}/access_tokens`, headers: { authorization: Redacted.make(`Bearer ${Redacted.value(appJwt(config, now))}`), accept: "application/vnd.github+json" } }).pipe(Effect.flatMap((value) => mapStatus("installation-token", value)))
    const body = object(response.body)
    if (typeof body.token !== "string" || typeof body.expires_at !== "string") return yield* new GitHubUnexpectedResponse({ operation: "installation-token", status: response.status })
    cached = { token: Redacted.make(body.token), expiresAt: Date.parse(body.expires_at) }
    return cached
  }) })
}))

const api = (http: GitHubHttpClient["Service"], credentials: GitHubInstallationCredentials["Service"], operation: string, request: Omit<Parameters<GitHubHttpClient["Service"]["request"]>[0], "headers">) => credentials.get().pipe(Effect.flatMap(({ token }) => http.request({ ...request, headers: headers(token) })), Effect.flatMap((response) => mapStatus(operation, response)))

export const gitHubReaderLayer = (config: GitHubAppSettings): Layer.Layer<GitHubReader, never, GitHubHttpClient | GitHubInstallationCredentials> => Layer.effect(GitHubReader, Effect.gen(function*() {
  const http = yield* GitHubHttpClient; const credentials = yield* GitHubInstallationCredentials
  return GitHubReader.of({
    inspectIssue: Effect.fn("GitHubReader.inspectIssue")(function*(ref) {
      yield* requireScope(config, ref, "issues:read", "inspect-issue")
      const body = object((yield* api(http, credentials, "inspect-issue", { method: "GET", path: `/repos/${encode(ref.owner)}/${encode(ref.name)}/issues/${ref.number}` })).body)
      return { number: body.number, title: body.title, body: body.body ?? "", state: body.state, url: body.html_url }
    }),
    reviewPullRequest: Effect.fn("GitHubReader.reviewPullRequest")(function*(ref) {
      yield* requireScope(config, ref, "pull_requests:read", "review-pull-request")
      const root = `/repos/${encode(ref.owner)}/${encode(ref.name)}/pulls/${ref.number}`
      const pr = object((yield* api(http, credentials, "review-pull-request", { method: "GET", path: root })).body)
      const files = array((yield* api(http, credentials, "review-pull-request-files", { method: "GET", path: `${root}/files` })).body)
      return { number: pr.number, title: pr.title, body: pr.body ?? "", baseSha: object(pr.base).sha, headSha: object(pr.head).sha, files: files.map((item) => object(item).filename) }
    }),
  })
}))

const refSha = (http: GitHubHttpClient["Service"], credentials: GitHubInstallationCredentials["Service"], repository: RepositoryRef, branch: string) => api(http, credentials, "read-ref", { method: "GET", path: `/repos/${encode(repository.owner)}/${encode(repository.name)}/git/ref/heads/${encode(branch)}` }).pipe(Effect.map((response) => object(object(response.body).object).sha as string))
const ensureSha = (operation: string, expected: string, actual: string) => expected === actual ? Effect.void : Effect.fail(new GitHubConflict({ operation, expectedSha: expected, actualSha: actual }))

export const gitHubWriterLayer = (config: GitHubAppSettings): Layer.Layer<GitHubPublisher, never, GitHubHttpClient | GitHubInstallationCredentials | GitHubPushBroker> => Layer.effect(GitHubPublisher, Effect.gen(function*() {
  const http = yield* GitHubHttpClient; const credentials = yield* GitHubInstallationCredentials; const pushBroker = yield* GitHubPushBroker
  return GitHubPublisher.of({
    push: Effect.fn("GitHubPublisher.push")(function*(request) {
      yield* requireScope(config, request.repository, "contents:write", "push")
      yield* ensureSha("push", request.expectedBaseSha, yield* refSha(http, credentials, request.repository, request.branch))
      const credential = yield* credentials.get()
      return yield* pushBroker.push({ repository: request.repository, branch: request.branch, expectedBaseSha: request.expectedBaseSha, expectedHeadSha: request.expectedHeadSha, token: credential.token })
    }),
    createPullRequest: Effect.fn("GitHubPublisher.createPullRequest")(function*(request) {
      yield* requireScope(config, request.repository, "pull_requests:write", "create-pull-request")
      yield* ensureSha("create-pull-request", request.expectedBaseSha, yield* refSha(http, credentials, request.repository, request.base))
      yield* ensureSha("create-pull-request", request.expectedHeadSha, yield* refSha(http, credentials, request.repository, request.head))
      const key = `${request.diffHash}:${request.base}:${request.head}`; const tag = marker(key)
      const existing = array((yield* api(http, credentials, "list-pull-requests", { method: "GET", path: `/repos/${encode(request.repository.owner)}/${encode(request.repository.name)}/pulls`, query: { state: "open", head: `${request.repository.owner}:${request.head}`, base: request.base } })).body).find((item) => String(object(item).body ?? "").includes(tag))
      const result = existing === undefined ? object((yield* api(http, credentials, "create-pull-request", { method: "POST", path: `/repos/${encode(request.repository.owner)}/${encode(request.repository.name)}/pulls`, body: { title: request.title, body: `${request.body}\n\n${tag}`, base: request.base, head: request.head } })).body) : object(existing)
      return { number: result.number, url: result.html_url }
    }),
    comment: Effect.fn("GitHubPublisher.comment")(function*(request) {
      yield* requireScope(config, request.repository, "issues:write", "comment")
      if (request.subject === "pull-request") yield* ensureSha("comment", request.expectedHeadSha, yield* refSha(http, credentials, request.repository, `pull/${request.number}/head`))
      const path = `/repos/${encode(request.repository.owner)}/${encode(request.repository.name)}/issues/${request.number}/comments`; const tag = marker(`${request.diffHash}:${request.expectedHeadSha}`)
      const existing = array((yield* api(http, credentials, "list-comments", { method: "GET", path })).body).find((item) => String(object(item).body ?? "").includes(tag))
      const result = existing === undefined ? object((yield* api(http, credentials, "create-comment", { method: "POST", path, body: { body: `${request.body}\n\n${tag}` } })).body) : object(existing)
      return { url: result.html_url }
    }),
    submitReview: Effect.fn("GitHubPublisher.submitReview")(function*(request) {
      yield* requireScope(config, request.repository, "pull_requests:write", "submit-review")
      const pr = object((yield* api(http, credentials, "read-pull-request", { method: "GET", path: `/repos/${encode(request.repository.owner)}/${encode(request.repository.name)}/pulls/${request.number}` })).body)
      yield* ensureSha("submit-review", request.expectedBaseSha, object(pr.base).sha); yield* ensureSha("submit-review", request.expectedHeadSha, object(pr.head).sha)
      const tag = marker(`${request.diffHash}:${request.expectedHeadSha}:${request.event}`)
      const existing = array((yield* api(http, credentials, "list-reviews", { method: "GET", path: `/repos/${encode(request.repository.owner)}/${encode(request.repository.name)}/pulls/${request.number}/reviews` })).body).find((item) => String(object(item).body ?? "").includes(tag))
      const result = existing === undefined ? object((yield* api(http, credentials, "submit-review", { method: "POST", path: `/repos/${encode(request.repository.owner)}/${encode(request.repository.name)}/pulls/${request.number}/reviews`, body: { body: `${request.body}\n\n${tag}`, event: request.event.toUpperCase().replace("-", "_"), commit_id: request.expectedHeadSha } })).body) : object(existing)
      return { url: result.html_url }
    }),
  })
}))

/** Operation/resource authorization. Effective authority is deployment config ∩ actor/delegated scope. */
export const githubOperationPolicyLayer = (reader: GitHubAppSettings | undefined, writer: GitHubAppSettings | undefined): Layer.Layer<OperationPolicy> => Layer.succeed(OperationPolicy, OperationPolicy.of({ authorize: Effect.fn("GitHubOperationPolicy.authorize")(({ context, operation }): Effect.Effect<PolicyDecision> => {
  if (!operation.operationId.startsWith("github.")) return Effect.succeed({ _tag: "Allowed", requiresApproval: false })
  const repository = operation.contextInputs[0] as GitHubRepository | undefined
  if (repository === undefined) return Effect.succeed({ _tag: "Denied", reason: "GitHub repository resource is absent" })
  const writes = operation.operationId.startsWith("github.publish."); const config = writes ? writer : reader
  const authority = `github:${writes ? "write" : "read"}:${repoKey(repository)}`
  if (config === undefined || !hasRepo(config, repository) || (!context.delegatedAuthority.includes(authority) && !context.delegatedAuthority.includes(`github:${writes ? "write" : "read"}:*`))) return Effect.succeed({ _tag: "Denied", reason: "GitHub operation/resource scope denied" })
  return Effect.succeed({ _tag: "Allowed", requiresApproval: writes })
}) }))
