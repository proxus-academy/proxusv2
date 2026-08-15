// @effect-diagnostics anyUnknownInErrorContext:off
import { SqlDatabase, SqlUser, type SqlDatabaseAttributes, type SqlInstanceAttributes, type SqlUserAttributes } from "@microagi/alchemy-gcp"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { ResourceDependency } from "../resource-dependency.ts"

const serviceAccountSuffix = ".gserviceaccount.com"

interface PreviewDatabasePrincipal {
  /** IAM service-account email used for Cloud SQL IAM database authentication. */
  readonly email: string
}

export interface PreviewDatabaseProps {
  /** Attributes/reference to the shared instance. The component never creates or mutates it. */
  readonly instance: Pick<SqlInstanceAttributes, "project" | "name" | "connectionName">
  readonly prNumber: number
  readonly runtimePrincipal: PreviewDatabasePrincipal
  readonly migrationPrincipal: PreviewDatabasePrincipal
  /**
   * PostgreSQL grants are not exposed by @microagi/alchemy-gcp 0.11.7.
   * A real SQL-backed implementation must be supplied by the composition root.
   */
  readonly grants: PreviewDatabaseGrantPort
  /** Service-account resources and IAM grants required by both SQL IAM users. */
  readonly dependencies: ReadonlyArray<ResourceDependency>
}

export type PreviewDatabaseGrantRequest = {
  readonly dependsOn: ReadonlyArray<ResourceDependency>
  readonly database: string
  readonly runtimeRole: string
  readonly migrationRole: string
  readonly runtime: {
    readonly database: readonly ["CONNECT"]
    readonly schema: readonly ["USAGE"]
    readonly tables: readonly ["SELECT", "INSERT", "UPDATE", "DELETE"]
    readonly sequences: readonly ["USAGE", "SELECT"]
  }
  readonly migrations: {
    readonly database: readonly ["CONNECT", "CREATE", "TEMPORARY"]
    readonly schema: readonly ["USAGE", "CREATE"]
    readonly ownsSchemaChanges: true
  }
}

export interface PreviewDatabaseGrantOutputs {
  readonly resource: ResourceDependency
  readonly project: string
  readonly location: string
  readonly name: string
  readonly resourceName: string
}

export interface PreviewDatabaseGrantPort {
  /** Declares the bootstrap mechanism. It must not connect to PostgreSQL while composing/reconciling. */
  readonly apply: (request: PreviewDatabaseGrantRequest) => Effect.Effect<PreviewDatabaseGrantOutputs, unknown, unknown>
}

export interface PreviewDatabaseOutputs {
  readonly databaseName: string
  readonly instanceName: string
  readonly connectionName: string
  readonly runtimeDatabaseRole: string
  readonly migrationDatabaseRole: string
  /** Execute this job successfully before the migration job. */
  readonly bootstrapJob: PreviewDatabaseGrantOutputs
  readonly runtimeUser: ResourceDependency
  readonly migrationUser: ResourceDependency
}

export class PreviewDatabaseConfigurationError extends Data.TaggedError("PreviewDatabaseConfigurationError")<{
  readonly message: string
}> {}

interface PreviewDatabaseResources {
  readonly database: (id: string, props: { project: string; instance: string; name: string }) => Effect.Effect<SqlDatabaseAttributes, unknown, unknown>
  readonly user: (id: string, props: { project: string; instance: string; name: string; type: "CLOUD_IAM_SERVICE_ACCOUNT"; dependsOn: ReadonlyArray<ResourceDependency> }) => Effect.Effect<SqlUserAttributes & ResourceDependency, unknown, unknown>
}

const realResources: PreviewDatabaseResources = { database: SqlDatabase, user: SqlUser }

const roleForServiceAccount = (email: string): string => {
  if (!email.endsWith(serviceAccountSuffix) || email.length === serviceAccountSuffix.length) {
    throw new PreviewDatabaseConfigurationError({ message: `Cloud SQL IAM principal must be a service-account email: ${email}` })
  }
  return email.slice(0, -serviceAccountSuffix.length)
}

const validatePrNumber = (prNumber: number): void => {
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    throw new PreviewDatabaseConfigurationError({ message: "prNumber must be a positive safe integer" })
  }
}

/** Internal seam used by synthesis tests; production callers use PreviewDatabase. */
export const composePreviewDatabase = (props: PreviewDatabaseProps, resources: PreviewDatabaseResources) =>
  Effect.gen(function* () {
    validatePrNumber(props.prNumber)
    const runtimeRole = roleForServiceAccount(props.runtimePrincipal.email)
    const migrationRole = roleForServiceAccount(props.migrationPrincipal.email)
    if (runtimeRole === migrationRole) {
      return yield* new PreviewDatabaseConfigurationError({ message: "runtime and migration principals must be different" })
    }

    const prefix = `PreviewDatabase-pr-${props.prNumber}`
    const databaseName = `proxus_pr_${props.prNumber}`
    yield* resources.database(`${prefix}-Database`, {
      project: props.instance.project,
      instance: props.instance.name,
      name: databaseName,
    })
    const runtimeUser = yield* resources.user(`${prefix}-RuntimeUser`, {
      project: props.instance.project,
      instance: props.instance.name,
      name: runtimeRole,
      type: "CLOUD_IAM_SERVICE_ACCOUNT",
      dependsOn: props.dependencies,
    })
    const migrationUser = yield* resources.user(`${prefix}-MigrationUser`, {
      project: props.instance.project,
      instance: props.instance.name,
      name: migrationRole,
      type: "CLOUD_IAM_SERVICE_ACCOUNT",
      dependsOn: props.dependencies,
    })

    const bootstrapJob = yield* props.grants.apply({
      dependsOn: [...props.dependencies, runtimeUser, migrationUser],
      database: databaseName,
      runtimeRole,
      migrationRole,
      runtime: {
        database: ["CONNECT"],
        schema: ["USAGE"],
        tables: ["SELECT", "INSERT", "UPDATE", "DELETE"],
        sequences: ["USAGE", "SELECT"],
      },
      migrations: {
        database: ["CONNECT", "CREATE", "TEMPORARY"],
        schema: ["USAGE", "CREATE"],
        ownsSchemaChanges: true,
      },
    })

    return {
      databaseName,
      instanceName: props.instance.name,
      connectionName: props.instance.connectionName,
      runtimeDatabaseRole: runtimeRole,
      migrationDatabaseRole: migrationRole,
      bootstrapJob,
      runtimeUser,
      migrationUser,
    } satisfies PreviewDatabaseOutputs
  })

export const PreviewDatabase = (props: PreviewDatabaseProps) => composePreviewDatabase(props, realResources)
