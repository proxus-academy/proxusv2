// @effect-diagnostics anyUnknownInErrorContext:off
import { Job, type JobAttributes, type JobProps } from "@microagi/alchemy-gcp"
import { databaseBindingEnvironment, databaseBindingSecrets, type DatabaseBinding } from "./database-binding.ts"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { ResourceDependency } from "../resource-dependency.ts"

export interface MigrationSecretRef {
  /** Environment variable populated by Cloud Run from Secret Manager. */
  readonly name: string
  /** Existing Secret Manager ID. Values and Secret resources are deliberately not accepted. */
  readonly secretId: string
  readonly version?: string
}

export interface MigrationJobProps {
  readonly id: string
  readonly project: string
  readonly location: string
  readonly name: string
  readonly image: string
  readonly runtimeServiceAccount: string
  readonly databaseBinding: DatabaseBinding & { readonly access: "ddl" }
  readonly secretRefs?: ReadonlyArray<MigrationSecretRef>
  /** Explicitly non-secret environment configuration. */
  readonly config?: Readonly<Record<string, string>>
  readonly labels?: Readonly<Record<string, string>>
  /** Declarative resources which must be composed before the Job. */
  readonly dependencies: ReadonlyArray<ResourceDependency>
}

export interface MigrationJobOutputs {
  readonly resource: ResourceDependency
  readonly project: string
  readonly location: string
  readonly name: string
  /** Fully-qualified name accepted by the Cloud Run Jobs run API/workflow. */
  readonly resourceName: string
}

export class MigrationJobConfigurationError extends Data.TaggedError("MigrationJobConfigurationError")<{
  readonly message: string
}> {}

type JobResource = Pick<JobAttributes, "project" | "location" | "name" | "resourceName"> & ResourceDependency
interface MigrationJobResources {
  readonly job: (id: string, props: JobProps) => Effect.Effect<JobResource, unknown, unknown>
}

const realResources: MigrationJobResources = { job: Job }
const envName = /^[A-Z_][A-Z0-9_]*$/
const secretId = /^[A-Za-z0-9_-]+$/
const secretVersion = /^(latest|[1-9][0-9]*)$/
const digest = /^[a-z0-9-]+-docker\.pkg\.dev\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/

const fail = (message: string): never => { throw new MigrationJobConfigurationError({ message }) }

const validate = (props: MigrationJobProps, refs: ReadonlyArray<MigrationSecretRef>): void => {
  if (!digest.test(props.image)) fail("image must be an Artifact Registry URI pinned by sha256 digest")
  if (!props.image.startsWith(`${props.location}-docker.pkg.dev/${props.project}/`)) {
    fail("image must belong to the configured project and regional Artifact Registry location")
  }
  if (typeof props.runtimeServiceAccount === "string" && !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(props.runtimeServiceAccount)) {
    fail("runtimeServiceAccount must be a service-account email")
  }
  const names = new Set<string>()
  for (const ref of refs) {
    if (!envName.test(ref.name)) fail(`invalid secret environment name: ${ref.name}`)
    if (!secretId.test(ref.secretId)) fail("secret refs must contain IDs, never paths or values")
    if (ref.version !== undefined && !secretVersion.test(ref.version)) fail(`invalid secret version for ${ref.name}`)
    if (names.has(ref.name)) fail(`duplicate environment name: ${ref.name}`)
    names.add(ref.name)
  }
  for (const name of Object.keys(props.config ?? {})) {
    if (!envName.test(name)) fail(`invalid config environment name: ${name}`)
    if (names.has(name)) fail(`config cannot override secret environment: ${name}`)
  }
}

/** Internal seam for cloud-free composition tests. It only declares a Job; it never runs it. */
export const composeMigrationJob = (props: MigrationJobProps, resources: MigrationJobResources) =>
  Effect.gen(function* () {
    const refs = [...databaseBindingSecrets(props.databaseBinding), ...(props.secretRefs ?? [])]
    validate(props, refs)

    yield* props.databaseBinding.iam
    const jobProps: JobProps & { readonly dependsOn: ReadonlyArray<ResourceDependency> } = {
      project: props.project,
      location: props.location,
      name: props.name,
      ...(props.labels === undefined ? {} : { labels: { ...props.labels } }),
      template: {
        taskCount: 1,
        parallelism: 1,
        template: {
          serviceAccount: props.runtimeServiceAccount,
          maxRetries: 0,
          timeout: "900s",
          // Cloud Run v2 materializes GEN2 in every live Job. Declaring the
          // default keeps desired and observed templates identical without
          // dropping any user-controlled fields from drift detection.
          executionEnvironment: "EXECUTION_ENVIRONMENT_GEN2",
          containers: [{
            image: props.image,
            command: ["node"],
            args: ["/app/migrate.mjs"],
            env: [
              ...refs.map((ref) => ({
                name: ref.name,
                valueSource: { secretKeyRef: { secret: ref.secretId, version: ref.version ?? "latest" } },
              })),
              ...Object.entries({ ...databaseBindingEnvironment(props.databaseBinding), ...(props.config ?? {}) }).map(([name, value]) => ({ name, value })),
            ],
            resources: { limits: { cpu: "1", memory: "512Mi" } },
          }],
        },
      },
      dependsOn: props.dependencies,
    }
    const job = yield* resources.job(props.id, jobProps)

    return { resource: job, project: job.project, location: job.location, name: job.name, resourceName: job.resourceName } satisfies MigrationJobOutputs
  })

export const MigrationJob = (props: MigrationJobProps) => composeMigrationJob(props, realResources)
