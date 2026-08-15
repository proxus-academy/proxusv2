import * as Effect from "effect/Effect"

export interface DatabaseSecretRef {
  readonly name: string
  readonly secretId: string
  readonly version?: string
}

/** Typed database contract: legacy DATABASE_URL or passwordless Cloud SQL IAM. */
export type DatabaseBinding = {
  readonly kind: "cloud-sql-iam"
  readonly connectionName: string
  readonly database: string
  readonly user: string
  readonly iam: Effect.Effect<unknown, unknown, unknown>
} | {
  readonly kind: "database-url"
  readonly secret: DatabaseSecretRef
  readonly iam: Effect.Effect<unknown, unknown, unknown>
}

export const databaseBindingEnvironment = (binding: DatabaseBinding): Readonly<Record<string, string>> =>
  binding.kind === "cloud-sql-iam" ? {
    DATABASE_ADAPTER: "cloud-sql-iam",
    CLOUD_SQL_CONNECTION_NAME: binding.connectionName,
    DATABASE_NAME: binding.database,
    DATABASE_USER: binding.user,
  } : {}

export const databaseBindingSecrets = (binding: DatabaseBinding): ReadonlyArray<DatabaseSecretRef> =>
  binding.kind === "database-url" ? [binding.secret] : []
