export interface EffectReplacementRule {
  readonly id: string
  readonly modules: ReadonlySet<string>
  readonly message: string
  readonly alternatives: ReadonlyArray<string>
}

/**
 * These rules select application platform dependencies. They intentionally do
 * not duplicate Effect LSP expression diagnostics such as processEnv,
 * globalFetch, globalTimers or Effect composition diagnostics.
 */
export const effectReplacementRules: ReadonlyArray<EffectReplacementRule> = [
  {
    id: "no-native-sqlite",
    modules: new Set(["node:sqlite", "bun:sqlite", "better-sqlite3", "sqlite3"]),
    message: "Native SQLite bypasses Effect SQL's resource, error and telemetry model.",
    alternatives: ["@effect/sql-sqlite-node", "@effect/sql-sqlite-bun", "@effect/sql-pglite"],
  },
  {
    id: "no-dotenv",
    modules: new Set(["dotenv", "dotenv/config", "dotenv-flow", "@dotenvx/dotenvx"]),
    message: "Environment files must be loaded through Effect ConfigProvider rather than mutating process.env.",
    alternatives: ["Config", "ConfigProvider.fromEnv", "ConfigProvider.fromDotEnv"],
  },
]

export const ruleForModule = (moduleName: string): EffectReplacementRule | undefined =>
  effectReplacementRules.find((rule) => rule.modules.has(moduleName))
