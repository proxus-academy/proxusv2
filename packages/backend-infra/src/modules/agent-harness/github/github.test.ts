// @effect-diagnostics asyncFunction:off strictEffectProvide:off nodeBuiltinImport:off
import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { Effect, Exit, Layer, Redacted } from "effect"
import { GitHubPublisher, GitHubReader } from "@proxus/agent-harness/examples/engineering"
import { makeGitHubAppSettings } from "./config.js"
import { gitHubReaderLayer, gitHubWriterLayer, installationCredentialsLayer } from "./adapter.js"
import { GitHubAccessDenied, GitHubConflict, GitHubHttpClient, GitHubPushBroker, type GitHubHttpRequest, type GitHubHttpResponse } from "./contracts.js"

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const settings = (role: "reader" | "writer", permissions: ReadonlyArray<string>) => makeGitHubAppSettings({ role, appId: "1", installationId: "2", privateKey: Redacted.make(privateKey), apiBaseUrl: new URL("https://api.github.test"), repositories: ["acme/widget"], permissions })
const fakeHttp = (respond: (request: GitHubHttpRequest) => GitHubHttpResponse) => {
  const requests: Array<GitHubHttpRequest> = []
  const layer = Layer.succeed(GitHubHttpClient, GitHubHttpClient.of({ request: Effect.fn("FakeGitHubHttp.request")((request) => Effect.sync(() => { requests.push(request); return respond(request) })) }))
  return { requests, layer }
}
const readerRuntime = (config: ReturnType<typeof settings>, http: Layer.Layer<GitHubHttpClient>) => {
  const credentials = installationCredentialsLayer(config).pipe(Layer.provide(http))
  return gitHubReaderLayer(config).pipe(Layer.provide(Layer.merge(http, credentials)))
}
const writerRuntime = (config: ReturnType<typeof settings>, http: Layer.Layer<GitHubHttpClient>) => {
  const credentials = installationCredentialsLayer(config).pipe(Layer.provide(http))
  const push = Layer.succeed(GitHubPushBroker, GitHubPushBroker.of({ push: Effect.fn("FakePush.push")((request) => Effect.succeed({ headSha: request.expectedHeadSha })) }))
  return gitHubWriterLayer(config).pipe(Layer.provide(Layer.mergeAll(http, credentials, push)))
}
const token = (value: string, expires = "2099-01-01T00:00:00.000Z") => ({ status: 201, body: { token: value, expires_at: expires } })
const sha = (digit: string) => digit.repeat(40)
const diffHash = `sha256:${"a".repeat(64)}`

describe("GitHub App adapters", () => {
  it("denies repositories and permissions before acquiring a token", async () => {
    const fake = fakeHttp(() => token("secret")); const config = settings("reader", [])
    const exit = await Effect.runPromiseExit(GitHubReader.use((service) => service.inspectIssue({ owner: "acme", name: "widget", number: 1 })).pipe(Effect.provide(readerRuntime(config, fake.layer))))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(exit.cause.toString()).toContain("GitHubAccessDenied")
    expect(fake.requests).toHaveLength(0)
  })

  it("refreshes expiring installation credentials and keeps authorization redacted", async () => {
    let issued = 0
    const fake = fakeHttp((request) => request.path.includes("access_tokens") ? token(`secret-${++issued}`, issued === 1 ? "1970-01-01T00:00:00.000Z" : undefined) : ({ status: 200, body: { number: 1, title: "Issue", body: "body", state: "open", html_url: "https://github.test/1" } }))
    const layer = readerRuntime(settings("reader", ["issues:read"]), fake.layer)
    await Effect.runPromise(GitHubReader.use((service) => service.inspectIssue({ owner: "acme", name: "widget", number: 1 }).pipe(Effect.andThen(service.inspectIssue({ owner: "acme", name: "widget", number: 1 })))).pipe(Effect.provide(layer)))
    expect(issued).toBe(2)
    const serialized = JSON.stringify(fake.requests)
    expect(serialized).not.toContain("secret-1"); expect(serialized).not.toContain("secret-2")
    expect(serialized).toContain("<redacted>")
  })

  it("fails safely on an expected-SHA conflict before publishing", async () => {
    const fake = fakeHttp((request) => request.path.includes("access_tokens") ? token("secret") : ({ status: 200, body: { object: { sha: sha("2") } } }))
    const exit = await Effect.runPromiseExit(GitHubPublisher.use((service) => service.createPullRequest({ repository: { owner: "acme", name: "widget" }, base: "main", head: "change", title: "Title", body: "Body", expectedBaseSha: sha("1"), expectedHeadSha: sha("3"), diffHash })).pipe(Effect.provide(writerRuntime(settings("writer", ["pull_requests:write"]), fake.layer))))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(exit.cause.toString()).toContain("GitHubConflict")
    expect(fake.requests.some((request) => request.method === "POST" && request.path.endsWith("/pulls"))).toBe(false)
  })

  it("returns an existing pull request for the same idempotency marker", async () => {
    const fake = fakeHttp((request) => {
      if (request.path.includes("access_tokens")) return token("secret")
      if (request.path.includes("git/ref/heads/main")) return { status: 200, body: { object: { sha: sha("1") } } }
      if (request.path.includes("git/ref/heads/change")) return { status: 200, body: { object: { sha: sha("2") } } }
      return { status: 200, body: [{ number: 7, html_url: "https://github.test/pr/7", body: `existing <!-- proxus-idempotency:${diffHash}:main:change -->` }] }
    })
    const result = await Effect.runPromise(GitHubPublisher.use((service) => service.createPullRequest({ repository: { owner: "acme", name: "widget" }, base: "main", head: "change", title: "Title", body: "Body", expectedBaseSha: sha("1"), expectedHeadSha: sha("2"), diffHash })).pipe(Effect.provide(writerRuntime(settings("writer", ["pull_requests:write"]), fake.layer))))
    expect(result.number).toBe(7)
    expect(fake.requests.filter((request) => request.method === "POST" && request.path.endsWith("/pulls"))).toHaveLength(0)
  })

  it("does not create a duplicate comment with the same approved evidence", async () => {
    const tag = `<!-- proxus-idempotency:${diffHash}:${sha("1")} -->`
    const fake = fakeHttp((request) => request.path.includes("access_tokens") ? token("secret") : ({ status: 200, body: [{ html_url: "https://github.test/comment/4", body: `already sent ${tag}` }] }))
    const result = await Effect.runPromise(GitHubPublisher.use((service) => service.comment({ repository: { owner: "acme", name: "widget" }, subject: "issue", number: 4, body: "Body", expectedHeadSha: sha("1"), diffHash })).pipe(Effect.provide(writerRuntime(settings("writer", ["issues:write"]), fake.layer))))
    expect(result.url).toBe("https://github.test/comment/4")
    expect(fake.requests.filter((request) => request.method === "POST" && request.path.endsWith("/comments"))).toHaveLength(0)
  })

  it("maps remote authorization errors without leaking response bodies", async () => {
    const fake = fakeHttp((request) => request.path.includes("access_tokens") ? token("secret") : ({ status: 403, body: { message: "sensitive upstream detail" } }))
    const exit = await Effect.runPromiseExit(GitHubReader.use((service) => service.inspectIssue({ owner: "acme", name: "widget", number: 1 })).pipe(Effect.provide(readerRuntime(settings("reader", ["issues:read"]), fake.layer))))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) { expect(exit.cause.toString()).toContain("GitHubAccessDenied"); expect(exit.cause.toString()).not.toContain("sensitive") }
  })
})
