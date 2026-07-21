import { Config, Context, Effect, Layer, Redacted } from "effect"
import type { GitHubAppRole } from "./contracts.js"

export interface GitHubAppSettings {
  readonly role: GitHubAppRole
  readonly appId: string
  readonly installationId: string
  readonly privateKey: Redacted.Redacted
  readonly apiBaseUrl: URL
  readonly repositories: ReadonlySet<string>
  readonly permissions: ReadonlySet<string>
}
export class GitHubReaderConfig extends Context.Service<GitHubReaderConfig, GitHubAppSettings>()("@proxus/backend-infra/modules/agent-harness/github/config/GitHubReaderConfig") {}
export class GitHubWriterConfig extends Context.Service<GitHubWriterConfig, GitHubAppSettings>()("@proxus/backend-infra/modules/agent-harness/github/config/GitHubWriterConfig") {}
const parseList = (value: string) => new Set(value.split(",").map((item) => item.trim()).filter(Boolean))
const load = (prefix: string, role: GitHubAppRole) => Effect.gen(function*() {
  const appId = yield* Config.nonEmptyString(`${prefix}_APP_ID`)
  const installationId = yield* Config.nonEmptyString(`${prefix}_INSTALLATION_ID`)
  const privateKey = yield* Config.redacted(`${prefix}_PRIVATE_KEY`)
  const apiBaseUrl = yield* Config.url(`${prefix}_API_URL`).pipe(Config.withDefault(new URL("https://api.github.com")))
  const repositories = parseList(yield* Config.nonEmptyString(`${prefix}_REPOSITORIES`))
  const permissions = parseList(yield* Config.nonEmptyString(`${prefix}_PERMISSIONS`))
  return { role, appId, installationId, privateKey, apiBaseUrl, repositories, permissions }
})
export const gitHubReaderConfigLayer = Layer.effect(GitHubReaderConfig, load("GITHUB_READER", "reader"))
export const gitHubWriterConfigLayer = Layer.effect(GitHubWriterConfig, load("GITHUB_WRITER", "writer"))
export const makeGitHubAppSettings = (input: Omit<GitHubAppSettings, "repositories" | "permissions"> & { readonly repositories: ReadonlyArray<string>; readonly permissions: ReadonlyArray<string> }): GitHubAppSettings => ({ ...input, repositories: new Set(input.repositories), permissions: new Set(input.permissions) })
