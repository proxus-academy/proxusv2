import * as gcp from "@pulumi/gcp"
import * as pulumi from "@pulumi/pulumi"

export const defaultRegion = "europe-southwest1"

export const projectId = (): string => {
  const value = gcp.config.project
  if (value === undefined || value.length === 0) {
    throw new pulumi.RunError("Set gcp:project for this stack; no GCP project is inferred.")
  }
  return value
}

export const region = (): string => gcp.config.region ?? defaultRegion

export const assertNoPublicPrincipal = (member: string): void => {
  if (member === "allUsers" || member === "allAuthenticatedUsers") {
    throw new pulumi.RunError(`Public IAM principal ${member} is forbidden.`)
  }
}
