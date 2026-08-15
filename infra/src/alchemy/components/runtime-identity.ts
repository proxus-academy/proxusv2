// @effect-diagnostics anyUnknownInErrorContext:off
import {
  ServiceAccount,
  serviceAccountIamMember,
  type ServiceAccount as ServiceAccountResource,
} from "@microagi/alchemy-gcp"
import type { Output } from "alchemy/Output"
import type { ResourceDependency } from "../resource-dependency.ts"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { BigQueryDatasetIamMember } from "../providers/bigquery.ts"
import { ProjectIamMember } from "../providers/project-iam-member.ts"
import { SecretIamMember } from "../providers/secret-manager.ts"

const publicPrincipals = new Set(["allUsers", "allAuthenticatedUsers"])

export interface RuntimeIdentityProps {
  readonly id: string
  readonly projectId: string
  readonly accountId: string
  readonly displayName?: string
  readonly description?: string
  /** Deployer IAM principal, normally `serviceAccount:<email>`. */
  readonly deployer: string
  /** Adds Cloud SQL instance-user in addition to Cloud SQL client. */
  readonly iamDatabaseAuthentication: boolean
  /** Existing Secret Manager IDs; this component creates grants, never secrets or versions. */
  readonly secretIds: ReadonlyArray<string>
  /** Canonical `projects/{project}/datasets/{dataset}` name of an existing dataset. */
  readonly bigQueryDataset?: string
}

export interface RuntimeIdentityOutputs {
  readonly email: string
  readonly name: Output<string> | string
  /** Physical nodes required before a workload may attach/use this identity. */
  readonly dependencies: ReadonlyArray<ResourceDependency>
}

export class RuntimeIdentityConfigurationError extends Data.TaggedError("RuntimeIdentityConfigurationError")<{
  readonly message: string
}> {}

type Account = { readonly email: Output<string> | string; readonly name: Output<string> | string; readonly target: ResourceDependency }

interface RuntimeIdentityResources {
  readonly serviceAccount: (id: string, props: {
    readonly project: string
    readonly accountId: string
    readonly displayName?: string
    readonly description?: string
  }) => Effect.Effect<Account, unknown, unknown>
  readonly serviceAccountGrant: (target: unknown, key: string, grant: { role: string; member: string }) => Effect.Effect<void, unknown, unknown>
  readonly projectGrant: (id: string, grant: { projectId: string; role: string; member: string; dependsOn: ReadonlyArray<ResourceDependency> }) => Effect.Effect<ResourceDependency, unknown, unknown>
  readonly secretGrant: (id: string, props: { secret: string; role: string; member: string; dependsOn: ReadonlyArray<ResourceDependency> }) => Effect.Effect<ResourceDependency, unknown, unknown>
  readonly datasetGrant: (id: string, props: { dataset: string; role: string; member: string; dependsOn: ReadonlyArray<ResourceDependency> }) => Effect.Effect<ResourceDependency, unknown, unknown>
}

const realResources: RuntimeIdentityResources = {
  serviceAccount: (id, props) => ServiceAccount(id, props).pipe(Effect.map((account) => ({ email: account.email, name: account.name, target: account }))),
  serviceAccountGrant: (target, key, grant) => serviceAccountIamMember(target as ServiceAccountResource, key, grant),
  projectGrant: ProjectIamMember,
  secretGrant: SecretIamMember,
  datasetGrant: BigQueryDatasetIamMember,
}

const rejectPublic = (principal: string): void => {
  if (publicPrincipals.has(principal)) {
    throw new RuntimeIdentityConfigurationError({ message: `Public IAM principal is forbidden: ${principal}` })
  }
}

const validate = (props: RuntimeIdentityProps): void => {
  rejectPublic(props.deployer)
  if (!props.deployer.includes(":")) throw new RuntimeIdentityConfigurationError({ message: "deployer must be an IAM principal" })
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(props.projectId)) {
    throw new RuntimeIdentityConfigurationError({ message: "projectId must be a valid GCP project ID" })
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(props.accountId)) {
    throw new RuntimeIdentityConfigurationError({ message: "accountId must be a valid GCP service account ID" })
  }
  if (props.secretIds.some((id) => id.length === 0 || id.includes("/"))) {
    throw new RuntimeIdentityConfigurationError({ message: "secretIds must contain Secret Manager IDs, not paths or values" })
  }
}

/** Internal seam for cloud-free composition tests. */
export const composeRuntimeIdentity = (props: RuntimeIdentityProps, resources: RuntimeIdentityResources) =>
  Effect.gen(function* () {
    validate(props)
    const account = yield* resources.serviceAccount(`${props.id}-ServiceAccount`, {
      project: props.projectId,
      accountId: props.accountId,
      ...(props.displayName === undefined ? {} : { displayName: props.displayName }),
      ...(props.description === undefined ? {} : { description: props.description }),
    })
    // IAM member providers require a concrete string. This physical identity is fixed by
    // Service Account project/accountId, so do not read or coerce account.email early.
    const email = `${props.accountId}@${props.projectId}.iam.gserviceaccount.com`
    const member = `serviceAccount:${email}`

    yield* resources.serviceAccountGrant(account.target, "Deployer-ServiceAccountUser", {
      role: "roles/iam.serviceAccountUser",
      member: props.deployer,
    })
    // Chain project IAM mutations. Besides expressing the SA edge, this avoids
    // concurrent policy read/modify/write cycles and their redundant 429/etag conflicts.
    const dependencies: ResourceDependency[] = [account.target]
    const cloudSqlClient = yield* resources.projectGrant(`${props.id}-CloudSqlClient`, { projectId: props.projectId, role: "roles/cloudsql.client", member, dependsOn: [...dependencies] })
    dependencies.push(cloudSqlClient)
    if (props.iamDatabaseAuthentication) {
      const instanceUser = yield* resources.projectGrant(`${props.id}-CloudSqlInstanceUser`, { projectId: props.projectId, role: "roles/cloudsql.instanceUser", member, dependsOn: [...dependencies] })
      dependencies.push(instanceUser)
    }
    for (const [index, secretId] of [...new Set(props.secretIds)].entries()) {
      const grant = yield* resources.secretGrant(`${props.id}-SecretAccessor-${index}`, {
        secret: `projects/${props.projectId}/secrets/${secretId}`,
        role: "roles/secretmanager.secretAccessor",
        member,
        dependsOn: [...dependencies],
      })
      dependencies.push(grant)
    }
    if (props.bigQueryDataset !== undefined) {
      const grant = yield* resources.datasetGrant(`${props.id}-BigQueryDatasetWriter`, {
        dataset: props.bigQueryDataset,
        role: "roles/bigquery.dataEditor",
        member,
        dependsOn: [...dependencies],
      })
      dependencies.push(grant)
    }

    return { email, name: account.name, dependencies } satisfies RuntimeIdentityOutputs
  })

export const RuntimeIdentity = (props: RuntimeIdentityProps) => composeRuntimeIdentity(props, realResources)
