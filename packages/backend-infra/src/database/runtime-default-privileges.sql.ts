import { postgresIdentifier } from "./bootstrap-preview.sql.js"

/** SQL run as the migration role after migrations have created all objects. */
export const runtimeDefaultPrivilegesSql = (runtimeRole: string) => {
  const runtime = postgresIdentifier(runtimeRole)
  return ["public", "drizzle"].flatMap((schema) => [
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM PUBLIC`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtime}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtime}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM PUBLIC`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM PUBLIC`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtime}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${runtime}`,
  ])
}
