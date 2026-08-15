// @effect-diagnostics processEnv:off
import { AuthTypes, Connector } from "@google-cloud/cloud-sql-connector"
import pg from "pg"
import { previewGrantSql } from "./bootstrap-preview.sql"

const required = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`)
  return value
}
const connectionName = required("CLOUD_SQL_CONNECTION_NAME")
const database = required("DATABASE_NAME")
const runtimeRole = required("DATABASE_RUNTIME_ROLE")
const migrationRole = required("DATABASE_MIGRATION_ROLE")
const databaseUser = required("DATABASE_USER")
const databasePassword = required("DATABASE_PASSWORD")
if (required("DATABASE_ADAPTER") !== "cloud-sql-password") throw new Error("DATABASE_ADAPTER must be cloud-sql-password")
const sql = previewGrantSql({ database, runtimeRole, migrationRole })
const connector = new Connector()

try {
  const options = await connector.getOptions({ instanceConnectionName: connectionName, authType: AuthTypes.PASSWORD })
  const admin = new pg.Client({ ...options, user: databaseUser, password: databasePassword, database: "postgres" })
  await admin.connect()
  try {
    for (const statement of sql.database) await admin.query(statement)
  } finally { await admin.end() }

  const target = new pg.Client({ ...options, user: databaseUser, password: databasePassword, database })
  await target.connect()
  try {
    await target.query("BEGIN")
    for (const statement of sql.target) await target.query(statement)
    await target.query("COMMIT")
  } catch (error) {
    await target.query("ROLLBACK")
    throw error
  } finally { await target.end() }
} finally {
  connector.close()
}
