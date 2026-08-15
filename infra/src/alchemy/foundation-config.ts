import * as Data from "effect/Data"
import type { Lease } from "./state/lease-lock.ts"

export interface FoundationConfig {
  readonly project: string
  readonly projectNumber: string
  readonly projectParent: { readonly type: "folder" | "organization"; readonly id: string }
  readonly projectDisplayName: string
  readonly region: string
  readonly githubRepository: string
  readonly stateBucket: string
  readonly stateKmsKey: string
  readonly cloudBuildSourceBucket: string
  readonly cloudBuildSourceBucketLocation: string
  readonly foundationDeployerPrincipal: string
  readonly adoptExisting: boolean
  readonly lease: Lease
}
export class FoundationConfigError extends Data.TaggedError("FoundationConfigError")<{ readonly message: string }> {}
const required = (env: NodeJS.ProcessEnv, name: string) => { const value = env[name]?.trim(); if (value === undefined || value.length === 0) throw new FoundationConfigError({ message: `${name} is required` }); return value }
export const readFoundationConfig = (env: NodeJS.ProcessEnv): FoundationConfig => {
  const project = required(env, "GCP_PROJECT_ID")
  const repository = required(env, "GITHUB_REPOSITORY")
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new FoundationConfigError({ message: "GITHUB_REPOSITORY must use owner/repository form" })
  const parentType = required(env, "GCP_PROJECT_PARENT_TYPE")
  if (parentType !== "folder" && parentType !== "organization") throw new FoundationConfigError({ message: "GCP_PROJECT_PARENT_TYPE must be folder or organization" })
  const stack = required(env, "ALCHEMY_STACK_NAME")
  if (stack !== "foundation") throw new FoundationConfigError({ message: "ALCHEMY_STACK_NAME must be foundation" })
  const expiresAt = Number(required(env, "ALCHEMY_LEASE_EXPIRES_AT"))
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new FoundationConfigError({ message: "ALCHEMY_LEASE_EXPIRES_AT must be a positive integer" })
  const adoption = env.ALCHEMY_ADOPT_EXISTING?.trim()
  if (adoption !== "true" && adoption !== "false") throw new FoundationConfigError({ message: "ALCHEMY_ADOPT_EXISTING must explicitly be true or false" })
  const foundationDeployerPrincipal = required(env, "GCP_FOUNDATION_DEPLOYER_PRINCIPAL")
  if (!/^serviceAccount:[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(foundationDeployerPrincipal)) throw new FoundationConfigError({ message: "GCP_FOUNDATION_DEPLOYER_PRINCIPAL must be a service-account IAM principal" })
  return {
    project, projectNumber: required(env, "GCP_PROJECT_NUMBER"), projectDisplayName: required(env, "GCP_PROJECT_DISPLAY_NAME"),
    projectParent: { type: parentType, id: required(env, "GCP_PROJECT_PARENT_ID") }, region: required(env, "GCP_REGION"),
    githubRepository: repository, stateBucket: required(env, "ALCHEMY_STATE_BUCKET"), stateKmsKey: required(env, "ALCHEMY_STATE_KMS_KEY"),
    cloudBuildSourceBucket: env.GCP_CLOUD_BUILD_SOURCE_BUCKET?.trim() || `${project}_cloudbuild`,
    cloudBuildSourceBucketLocation: env.GCP_CLOUD_BUILD_SOURCE_BUCKET_LOCATION?.trim() || "US",
    foundationDeployerPrincipal, adoptExisting: adoption === "true",
    lease: { stack, stage: required(env, "ALCHEMY_STAGE"), owner: required(env, "ALCHEMY_LEASE_OWNER"), leaseId: required(env, "ALCHEMY_LEASE_ID"), generation: required(env, "ALCHEMY_LEASE_GENERATION"), expiresAt },
  }
}
