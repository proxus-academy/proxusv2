import { describe, expect, it } from "vitest"
import { foundationApiNames, foundationPhysicalIds } from "./foundation.ts"

const live = {
  projectId: "proxus-v2",
  projectNumber: "474767709287",
  region: "europe-southwest1",
  repositoryName: "projects/proxus-v2/locations/europe-southwest1/repositories/proxus",
  serviceAccountName: "projects/proxus-v2/serviceAccounts/proxus-cloud-build@proxus-v2.iam.gserviceaccount.com",
  productionPoolName: "projects/474767709287/locations/global/workloadIdentityPools/github-production",
  previewProviderName: "projects/474767709287/locations/global/workloadIdentityPools/github-preview/providers/github",
} as const

describe("foundation cold-adoption contracts", () => {
  it("uses the exact physical lookup keys returned by the live GCP APIs", () => {
    const ids = foundationPhysicalIds({ project: live.projectId, projectNumber: live.projectNumber, region: live.region, cloudBuildSourceBucket: "proxus-v2_cloudbuild" })
    expect(ids.project).toBe(live.projectId)
    expect(ids.cloudBuildSourceBucket).toBe("proxus-v2_cloudbuild")
    expect(ids.repository).toBe(live.repositoryName)
    expect(ids.serviceAccount("proxus-cloud-build")).toBe(live.serviceAccountName)
    expect(ids.workloadIdentityPool("production")).toBe(live.productionPoolName)
    expect(ids.workloadIdentityProvider("preview")).toBe(live.previewProviderName)
  })

  it("declares only APIs observed enabled in the live foundation project", () => {
    const observedEnabled = new Set([
      "artifactregistry.googleapis.com", "bigquery.googleapis.com", "cloudbuild.googleapis.com", "cloudkms.googleapis.com",
      "compute.googleapis.com", "iap.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com",
      "logging.googleapis.com", "run.googleapis.com", "secretmanager.googleapis.com", "sts.googleapis.com", "storage.googleapis.com",
    ])
    expect(foundationApiNames.every((service) => observedEnabled.has(service))).toBe(true)
  })
})
