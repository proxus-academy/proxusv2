// @effect-diagnostics anyUnknownInErrorContext:off
import { Job, type JobAttributes, type JobProps } from "@microagi/alchemy-gcp"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { PreviewDatabaseGrantPort, PreviewDatabaseGrantRequest, PreviewDatabaseGrantOutputs } from "./preview-database.ts"
import type { ResourceDependency } from "../resource-dependency.ts"

export interface PreviewDatabaseGrantJobProps {
  readonly project: string
  readonly location: string
  readonly image: string
  readonly connectionName: string
  /** Dedicated bootstrap workload identity; it is not the migration/runtime identity. */
  readonly serviceAccount: string
  readonly bootstrapUser: string
  readonly passwordSecretId: string
  readonly prNumber: number
  readonly labels?: Readonly<Record<string, string>>
  readonly dependencies: ReadonlyArray<ResourceDependency>
}

class PreviewDatabaseGrantConfigurationError extends Data.TaggedError("PreviewDatabaseGrantConfigurationError")<{
  readonly message: string
}> {}

type JobResource = Pick<JobAttributes, "project" | "location" | "name" | "resourceName"> & ResourceDependency
interface Resources {
  readonly job: (id: string, props: JobProps) => Effect.Effect<JobResource, unknown, unknown>
}
const realResources: Resources = { job: Job }
const digest = /^[a-z0-9-]+-docker\.pkg\.dev\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/
const role = /^[a-z0-9][a-z0-9@._-]{0,126}$/

const fail = (message: string): never => { throw new PreviewDatabaseGrantConfigurationError({ message }) }

export const composePreviewDatabaseGrantPort = (props: PreviewDatabaseGrantJobProps, resources: Resources): PreviewDatabaseGrantPort => ({
  apply: (request: PreviewDatabaseGrantRequest) => Effect.gen(function* () {
    if (!Number.isSafeInteger(props.prNumber) || props.prNumber <= 0) fail("prNumber must be a positive safe integer")
    if (!digest.test(props.image) || !props.image.startsWith(`${props.location}-docker.pkg.dev/${props.project}/`)) {
      fail("image must be a regional Artifact Registry URI in the configured project, pinned by digest")
    }
    if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(props.serviceAccount)) fail("serviceAccount must be an IAM service-account email")
    if (!role.test(props.bootstrapUser)) fail("invalid bootstrap user")
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(props.passwordSecretId)) fail("passwordSecretId must be a Secret Manager ID")
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(request.database)) fail("invalid database name")
    if (!role.test(request.runtimeRole) || !role.test(request.migrationRole)) fail("invalid database role")
    if (request.runtimeRole === request.migrationRole) fail("runtime and migration roles must differ")
    const jobProps: JobProps & { readonly dependsOn: ReadonlyArray<ResourceDependency> } = {
      project: props.project,
      location: props.location,
      name: `proxus-pr-${props.prNumber}-database-bootstrap`,
      dependsOn: [...props.dependencies, ...request.dependsOn],
      ...(props.labels === undefined ? {} : { labels: { ...props.labels } }),
      template: {
        taskCount: 1,
        parallelism: 1,
        template: {
          serviceAccount: props.serviceAccount,
          maxRetries: 0,
          timeout: "300s",
          containers: [{
            image: props.image,
            command: ["node"],
            args: ["/app/database-bootstrap.mjs"],
            env: [
              { name: "DATABASE_PASSWORD", valueSource: { secretKeyRef: { secret: props.passwordSecretId, version: "latest" } } },
              { name: "DATABASE_ADAPTER", value: "cloud-sql-password" },
              { name: "CLOUD_SQL_CONNECTION_NAME", value: props.connectionName },
              { name: "DATABASE_NAME", value: request.database },
              { name: "DATABASE_RUNTIME_ROLE", value: request.runtimeRole },
              { name: "DATABASE_MIGRATION_ROLE", value: request.migrationRole },
              { name: "DATABASE_USER", value: props.bootstrapUser },
            ],
            resources: { limits: { cpu: "1", memory: "512Mi" } },
          }],
        },
      },
    }
    const job = yield* resources.job(`PreviewDatabase-pr-${props.prNumber}-BootstrapJob`, jobProps)
    return { resource: job, project: job.project, location: job.location, name: job.name, resourceName: job.resourceName } satisfies PreviewDatabaseGrantOutputs
  }),
})

/** Declares an executable Job; it never opens a database connection during reconciliation. */
export const PreviewDatabaseGrantJob = (props: PreviewDatabaseGrantJobProps): PreviewDatabaseGrantPort =>
  composePreviewDatabaseGrantPort(props, realResources)
