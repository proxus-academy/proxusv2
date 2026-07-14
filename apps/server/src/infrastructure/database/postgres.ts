import { PgClient } from "@effect/sql-pg"
import { Config } from "effect"

export const PostgresProductionLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  applicationName: Config.succeed("proxus-server"),
})
