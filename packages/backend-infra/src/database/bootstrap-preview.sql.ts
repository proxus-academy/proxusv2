export const postgresIdentifier = (value: string): string => {
  if (!/^[a-z0-9][a-z0-9@._-]{0,126}$/.test(value)) throw new Error("invalid PostgreSQL identifier")
  return `"${value}"`
}

export const postgresLiteral = (value: string): string => {
  if (value.includes("\0")) throw new Error("invalid PostgreSQL literal")
  return `'${value.replaceAll("'", "''")}'`
}

export interface PreviewGrantSqlInput {
  readonly database: string
  readonly runtimeRole: string
  readonly migrationRole: string
}

/** SQL executed by the stable BUILT_IN bootstrap user (a cloudsqlsuperuser member). */
export const previewGrantSql = ({ database, runtimeRole, migrationRole }: PreviewGrantSqlInput) => {
  const db = postgresIdentifier(database)
  const runtime = postgresIdentifier(runtimeRole)
  const migrations = postgresIdentifier(migrationRole)
  const migrationsLiteral = postgresLiteral(migrationRole)
  const schemas = ["public", "drizzle"] as const

  return {
    database: [
      `REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE ${db} FROM PUBLIC`,
      `GRANT CONNECT ON DATABASE ${db} TO ${runtime}`,
      `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${db} TO ${migrations}`,
    ],
    target: [
      `DO $$ BEGIN IF pg_has_role(current_user, ${migrationsLiteral}, 'MEMBER') THEN ALTER SCHEMA public OWNER TO ${migrations}; END IF; END $$`,
      `CREATE SCHEMA IF NOT EXISTS drizzle`,
      `DO $$ BEGIN IF pg_has_role(current_user, ${migrationsLiteral}, 'MEMBER') THEN ALTER SCHEMA drizzle OWNER TO ${migrations}; END IF; END $$`,
      ...schemas.flatMap((schema) => [
        `REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`,
        `GRANT USAGE ON SCHEMA ${schema} TO ${runtime}`,
        `GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${migrations}`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtime}`,
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtime}`,
      ]),
    ],
  } as const
}
