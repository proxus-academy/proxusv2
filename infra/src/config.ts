import * as gcp from "@pulumi/gcp"
import * as pulumi from "@pulumi/pulumi"

export const defaultRegion = "europe-southwest1"
export const foundationStackReference = "organization/proxus-foundation/foundation"

export const projectId = (): string => {
  const value = gcp.config.project
  if (value === undefined || value.length === 0) {
    throw new pulumi.RunError("Set gcp:project for this stack; no GCP project is inferred.")
  }
  return value
}

export const validateRegion = (value: string): string => {
  if (value !== defaultRegion) {
    throw new pulumi.RunError(`GCP region must be ${defaultRegion}, not ${value}.`)
  }
  return value
}

export const region = (): string => validateRegion(gcp.config.region ?? defaultRegion)

export const assertStack = (expected: string): void => {
  const actual = pulumi.getStack()
  if (actual !== expected) {
    throw new pulumi.RunError(`This program must use stack ${expected}, not ${actual}.`)
  }
}

export const requireImageDigest = (
  config: pulumi.Config,
  key: string,
  project: string,
  location: string,
): string => {
  const value = config.require(key)
  const prefix = `${location}-docker.pkg.dev/${project}/`
  if (!value.startsWith(prefix) || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value.slice(prefix.length))) {
    throw new pulumi.RunError(
      `${key} must be an immutable ${location} Artifact Registry image URI for project ${project}.`,
    )
  }
  return value
}

export const requireSecretId = (config: pulumi.Config, key: string): string => {
  const value = config.require(key)
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(value)) {
    throw new pulumi.RunError(`${key} must be a Secret Manager secret ID, never a secret value or URL.`)
  }
  return value
}

export const requireBigQueryIdentifier = (config: pulumi.Config, key: string): string => {
  const value = config.require(key)
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(value)) {
    throw new pulumi.RunError(`${key} must be a BigQuery dataset or table identifier.`)
  }
  return value
}

export const requireBucketName = (config: pulumi.Config, key: string): string => {
  const value = config.require(key)
  if (
    value.length < 3 || value.length > 63 ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(value) ||
    value.includes("..") || value.includes(".-") || value.includes("-.") || value.includes("_.") || value.includes("._")
  ) {
    throw new pulumi.RunError(`${key} must be a valid globally unique GCS bucket name.`)
  }
  return value
}

export const requireGroupPrincipal = (config: pulumi.Config, key: string): string => {
  const value = config.require(key)
  if (!/^group:[^\s@]+@[^\s@]+$/.test(value)) {
    throw new pulumi.RunError(`${key} must use the form group:name@example.com.`)
  }
  return value
}

export const requirePrNumber = (config: pulumi.Config): number => {
  const value = config.requireNumber("prNumber")
  if (!Number.isInteger(value) || value < 1 || value > 999_999) {
    throw new pulumi.RunError("prNumber must be an integer between 1 and 999999.")
  }
  const expectedStack = `pr-${value}`
  assertStack(expectedStack)
  return value
}

export const assertNoPublicPrincipal = (member: string): void => {
  if (member === "allUsers" || member === "allAuthenticatedUsers") {
    throw new pulumi.RunError(`Public IAM principal ${member} is forbidden.`)
  }
}
