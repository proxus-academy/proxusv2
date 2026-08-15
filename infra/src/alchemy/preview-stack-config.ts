import { isIapAccessPrincipal, type IapAccessPrincipal } from "./iap-access-principal.ts"
import { Project } from "@microagi/alchemy-gcp"
import * as Data from "effect/Data"
import { asOutput, type Output } from "alchemy/Output"
import type { PreviewEnvironmentProps } from "./components/preview-environment.ts"
import type { Lease } from "./state/lease-lock.ts"

export interface PreviewStackConfig {
  readonly stage: `pr-${number}`
  readonly project: string
  readonly projectNumber: string
  readonly region: string
  readonly prNumber: number
  readonly previewDeployer: string
  readonly images: PreviewEnvironmentProps["images"]
  readonly secrets: PreviewEnvironmentProps["secrets"]
  readonly analytics: PreviewEnvironmentProps["analytics"]
  readonly mailgun: PreviewEnvironmentProps["mailgun"]
  readonly iapAccessPrincipal: IapAccessPrincipal
  readonly cloudSql: PreviewEnvironmentProps["cloudSql"]
  readonly deployServices: boolean
  readonly stateBucket: string
  readonly kmsKeyName: string
  readonly lease: Lease
}

class PreviewStackConfigError extends Data.TaggedError("PreviewStackConfigError")<{ readonly message: string }> {}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim()
  if (value === undefined || value.length === 0) throw new PreviewStackConfigError({ message: `${name} is required` })
  return value
}
const secretId = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = required(env, name)
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(value)) throw new PreviewStackConfigError({ message: `${name} must be a Secret Manager secret ID` })
  return value
}
const mailgunDomain = (env: NodeJS.ProcessEnv): string => {
  const value = required(env, "MAILGUN_DOMAIN")
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value)) {
    throw new PreviewStackConfigError({ message: "MAILGUN_DOMAIN must be a valid lower-case DNS hostname" })
  }
  return value
}
const mailgunFrom = (env: NodeJS.ProcessEnv): string => {
  const value = required(env, "MAILGUN_FROM")
  const address = "[^\\s<>@]+@[^\\s<>@]+"
  if (value.length > 320 || !new RegExp(`^(?:${address}|[^<>\\r\\n]{1,100} <${address}>)$`).test(value)) {
    throw new PreviewStackConfigError({ message: "MAILGUN_FROM must be an email or Name <email> without line breaks" })
  }
  return value
}
const image = (env: NodeJS.ProcessEnv, name: string, project: string, region: string): string => {
  const value = required(env, name)
  const prefix = `${region}-docker.pkg.dev/${project}/`
  if (!value.startsWith(prefix) || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value.slice(prefix.length))) {
    throw new PreviewStackConfigError({ message: `${name} must be an immutable Artifact Registry digest for the configured project and region` })
  }
  return value
}

export const readPreviewStackConfig = (env: NodeJS.ProcessEnv): PreviewStackConfig => {
  const project = required(env, "GCP_PROJECT_ID")
  const region = required(env, "GCP_REGION")
  const prNumber = Number(required(env, "PR_NUMBER"))
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) throw new PreviewStackConfigError({ message: "PR_NUMBER must be a positive safe integer" })
  const expectedStage = `pr-${prNumber}` as const
  const stage = required(env, "ALCHEMY_STAGE")
  if (!/^pr-[1-9][0-9]*$/.test(stage) || stage !== expectedStage) {
    throw new PreviewStackConfigError({ message: `ALCHEMY_STAGE must be ${expectedStage}` })
  }
  const deploy = required(env, "DEPLOY_SERVICES")
  if (deploy !== "true" && deploy !== "false") throw new PreviewStackConfigError({ message: "DEPLOY_SERVICES must be true or false" })
  const expiresAt = Number(required(env, "ALCHEMY_LEASE_EXPIRES_AT"))
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new PreviewStackConfigError({ message: "ALCHEMY_LEASE_EXPIRES_AT must be a positive integer" })
  const stack = required(env, "ALCHEMY_STACK_NAME")
  if (stack !== "preview") throw new PreviewStackConfigError({ message: "ALCHEMY_STACK_NAME must be preview" })
  const iapAccessPrincipal = required(env, "IAP_ACCESS_PRINCIPAL")
  if (!isIapAccessPrincipal(iapAccessPrincipal)) throw new PreviewStackConfigError({ message: "IAP_ACCESS_PRINCIPAL must be user:<email> or group:<email>" })
  const previewDeployer = required(env, "GCP_PREVIEW_DEPLOYER_PRINCIPAL")
  if (!/^serviceAccount:[^\s@]+@[^\s@]+$/.test(previewDeployer)) throw new PreviewStackConfigError({ message: "GCP_PREVIEW_DEPLOYER_PRINCIPAL must be a serviceAccount principal" })

  return {
    stage: stage as `pr-${number}`, project, projectNumber: required(env, "GCP_PROJECT_NUMBER"), region, prNumber,
    previewDeployer,
    images: {
      publicApi: image(env, "IMAGE_PUBLIC_API", project, region), adminApi: image(env, "IMAGE_ADMIN_API", project, region),
      web: image(env, "IMAGE_WEB", project, region), adminWeb: image(env, "IMAGE_ADMIN_WEB", project, region),
    },
    secrets: {
      bootstrapPasswordSecretId: secretId(env, "DATABASE_BOOTSTRAP_PASSWORD_SECRET_ID"),
      runtime: [
        { name: "AUTH_GOOGLE_SIGNING_SECRET", secretId: secretId(env, "AUTH_GOOGLE_SIGNING_SECRET_ID") },
        { name: "OBJECT_STORAGE_SIGNING_SECRET", secretId: secretId(env, "OBJECT_STORAGE_SIGNING_SECRET_ID") },
        { name: "MAILGUN_API_KEY", secretId: secretId(env, "MAILGUN_API_KEY_SECRET_ID") },
      ],
    },
    analytics: { project: required(env, "ANALYTICS_PROJECT_ID"), dataset: required(env, "ANALYTICS_DATASET"), table: required(env, "ANALYTICS_TABLE") },
    mailgun: { domain: mailgunDomain(env), from: mailgunFrom(env) },
    iapAccessPrincipal: iapAccessPrincipal as IapAccessPrincipal,
    cloudSql: { project: required(env, "CLOUD_SQL_PROJECT_ID"), name: required(env, "CLOUD_SQL_INSTANCE_NAME"), connectionName: required(env, "CLOUD_SQL_CONNECTION_NAME") },
    deployServices: deploy === "true", stateBucket: required(env, "ALCHEMY_STATE_BUCKET"), kmsKeyName: required(env, "ALCHEMY_STATE_KMS_KEY"),
    lease: { stack, stage, owner: required(env, "ALCHEMY_LEASE_OWNER"), leaseId: required(env, "ALCHEMY_LEASE_ID"), generation: required(env, "ALCHEMY_LEASE_GENERATION"), expiresAt },
  }
}

/** Cross-stack reference to the existing foundation project; this stack never declares a Project. */
export const foundationProjectReference = (): Output<Project> =>
  asOutput(Project.ref("FoundationProject", { stack: "foundation", stage: "foundation" }))
