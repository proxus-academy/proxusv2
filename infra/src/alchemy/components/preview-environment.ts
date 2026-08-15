// @effect-diagnostics anyUnknownInErrorContext:off
import type { IapAccessPrincipal } from "../iap-access-principal.ts"
import type { Project, SqlInstanceAttributes } from "@microagi/alchemy-gcp"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { MigrationJob, type MigrationJobOutputs, type MigrationSecretRef } from "./migration-job.ts"
import { PreviewDatabaseGrantJob, type PreviewDatabaseGrantJobProps } from "./preview-database-grants.ts"
import { PreviewDatabase, type PreviewDatabaseGrantPort, type PreviewDatabaseOutputs } from "./preview-database.ts"
import { PreviewServices, type PreviewAnalyticsConfig, type PreviewServiceImages, type PreviewServicesOutputs } from "./preview-services.ts"
import { RuntimeIdentity, type RuntimeIdentityOutputs } from "./runtime-identity.ts"

interface PreviewFoundationOutputs {
  readonly project: Project
  readonly projectId: string
  readonly projectNumber: string
  readonly location: string
  /** IAM principal allowed to attach the preview service accounts. */
  readonly previewDeployer: string
}

interface PreviewEnvironmentSecrets {
  readonly runtime: ReadonlyArray<MigrationSecretRef>
  readonly bootstrapPasswordSecretId: string
}

export interface PreviewEnvironmentProps {
  readonly prNumber: number
  readonly deployServices: boolean
  readonly foundation: PreviewFoundationOutputs
  /** Reference to the shared Cloud SQL instance; this component does not create it. */
  readonly cloudSql: Pick<SqlInstanceAttributes, "project" | "name" | "connectionName">
  readonly images: PreviewServiceImages
  readonly secrets: PreviewEnvironmentSecrets
  readonly analytics: PreviewAnalyticsConfig
  readonly mailgun: { readonly domain: string; readonly from: string }
  readonly iapAccessPrincipal: IapAccessPrincipal
}

interface PreviewEnvironmentOutputs {
  readonly migrationJob: MigrationJobOutputs
  readonly database: PreviewDatabaseOutputs
  /** Fully-qualified executable Job which must succeed before migrationJob is run. */
  readonly databaseBootstrapJob: PreviewDatabaseOutputs["bootstrapJob"]
  readonly public: undefined | Pick<PreviewServicesOutputs, "publicName" | "publicUrl">
  readonly admin: undefined | Pick<PreviewServicesOutputs, "adminName" | "adminUrl">
}

class PreviewEnvironmentConfigurationError extends Data.TaggedError("PreviewEnvironmentConfigurationError")<{
  readonly message: string
}> {}

interface PreviewEnvironmentComponents {
  readonly identity: (props: Parameters<typeof RuntimeIdentity>[0]) => Effect.Effect<RuntimeIdentityOutputs, unknown, unknown>
  readonly database: (props: Parameters<typeof PreviewDatabase>[0]) => Effect.Effect<PreviewDatabaseOutputs, unknown, unknown>
  readonly migrationJob: (props: Parameters<typeof MigrationJob>[0]) => Effect.Effect<MigrationJobOutputs, unknown, unknown>
  readonly services: (props: Parameters<typeof PreviewServices>[0]) => Effect.Effect<PreviewServicesOutputs, unknown, unknown>
  readonly databaseGrantPort: (props: PreviewDatabaseGrantJobProps) => PreviewDatabaseGrantPort
}

const realComponents: PreviewEnvironmentComponents = {
  identity: RuntimeIdentity,
  database: PreviewDatabase,
  migrationJob: MigrationJob,
  services: PreviewServices,
  databaseGrantPort: PreviewDatabaseGrantJob,
}

const validate = (props: PreviewEnvironmentProps): void => {
  if (!Number.isSafeInteger(props.prNumber) || props.prNumber <= 0) {
    throw new PreviewEnvironmentConfigurationError({ message: "prNumber must be a positive safe integer" })
  }
}

/** Cloud-free seam for tests. The migration job is declared but never executed. */
export const composePreviewEnvironment = (props: PreviewEnvironmentProps, components: PreviewEnvironmentComponents) => {
  validate(props)
  const pr = `pr-${props.prNumber}`
  const labels = { system: "proxus-v2", environment: "preview", pr: String(props.prNumber), managed_by: "alchemy" }

  return Effect.gen(function* () {
    const runtimeIdentity = yield* components.identity({
      id: `PreviewEnvironment-${pr}-Runtime`, projectId: props.foundation.projectId,
      accountId: `proxus-${pr}-runtime`, displayName: `Proxus ${pr} runtime`, deployer: props.foundation.previewDeployer,
      iamDatabaseAuthentication: true, secretIds: [...props.secrets.runtime.map((secret) => secret.secretId)],
      bigQueryDataset: `projects/${props.analytics.project}/datasets/${props.analytics.dataset}`,
    })
    const migrationIdentity = yield* components.identity({
      id: `PreviewEnvironment-${pr}-Migrations`, projectId: props.foundation.projectId,
      accountId: `proxus-${pr}-migrations`, displayName: `Proxus ${pr} migrations`, deployer: props.foundation.previewDeployer,
      iamDatabaseAuthentication: true, secretIds: [],
    })
    const bootstrapIdentity = yield* components.identity({
      id: `PreviewEnvironment-${pr}-Bootstrap`, projectId: props.foundation.projectId,
      accountId: `proxus-${pr}-bootstrap`, displayName: `Proxus ${pr} database bootstrap`, deployer: props.foundation.previewDeployer,
      iamDatabaseAuthentication: false, secretIds: [props.secrets.bootstrapPasswordSecretId],
    })
    const databaseGrants = components.databaseGrantPort({
      project: props.foundation.projectId,
      location: props.foundation.location,
      image: props.images.publicApi,
      connectionName: props.cloudSql.connectionName,
      serviceAccount: bootstrapIdentity.email,
      bootstrapUser: "proxus_preview_bootstrap",
      passwordSecretId: props.secrets.bootstrapPasswordSecretId,
      prNumber: props.prNumber,
      labels,
      dependencies: bootstrapIdentity.dependencies,
    })
    const database = yield* components.database({
      instance: props.cloudSql, prNumber: props.prNumber, runtimePrincipal: { email: runtimeIdentity.email },
      migrationPrincipal: { email: migrationIdentity.email }, grants: databaseGrants,
      dependencies: [...runtimeIdentity.dependencies, ...migrationIdentity.dependencies],
    })
    const migrationJob = yield* components.migrationJob({
      id: `PreviewEnvironment-${pr}-MigrationJob`, project: props.foundation.projectId, location: props.foundation.location,
      name: `proxus-${pr}-migrations`, image: props.images.publicApi, runtimeServiceAccount: migrationIdentity.email,
      databaseBinding: { access: "ddl", kind: "cloud-sql-iam", connectionName: database.connectionName, database: database.databaseName, user: database.migrationDatabaseRole, iam: Effect.void },
      config: { DATABASE_MIGRATIONS_DIR: "/app/drizzle", DATABASE_RUNTIME_ROLE: database.runtimeDatabaseRole }, labels,
      dependencies: [...migrationIdentity.dependencies, database.migrationUser, database.bootstrapJob.resource],
    })

    if (!props.deployServices) return { migrationJob, database, databaseBootstrapJob: database.bootstrapJob, public: undefined, admin: undefined } satisfies PreviewEnvironmentOutputs

    const services = yield* components.services({
      project: props.foundation.projectId, projectNumber: props.foundation.projectNumber, location: props.foundation.location,
      prNumber: props.prNumber, accessPrincipal: props.iapAccessPrincipal, runtimeIdentity,
      databaseBinding: { access: "runtime", kind: "cloud-sql-iam", connectionName: database.connectionName, database: database.databaseName, user: database.runtimeDatabaseRole, iam: Effect.void }, secretRefs: props.secrets.runtime,
      analytics: props.analytics, mailgun: props.mailgun, images: props.images, migration: migrationJob.resource,
      dependencies: [database.runtimeUser],
    })
    return {
      migrationJob, database, databaseBootstrapJob: database.bootstrapJob,
      public: { publicName: services.publicName, publicUrl: services.publicUrl },
      admin: { adminName: services.adminName, adminUrl: services.adminUrl },
    } satisfies PreviewEnvironmentOutputs
  })
}

export const PreviewEnvironment = (props: PreviewEnvironmentProps) => composePreviewEnvironment(props, realComponents)
