import {
  ApiEnable,
  ArtifactRegistryRepository,
  Network,
  Project,
  Service,
  ServiceAccount,
  SqlInstance,
  StorageBucket,
  WorkloadIdentityPool,
} from "@microagi/alchemy-gcp"
import { describe, expect, test } from "vitest"

const requiredGcpExports = {
  ApiEnable,
  ArtifactRegistryRepository,
  Network,
  Project,
  Service,
  ServiceAccount,
  SqlInstance,
  StorageBucket,
  WorkloadIdentityPool,
}

describe("Alchemy GCP compatibility", () => {
  test("loads the GCP resource exports needed by the infrastructure", () => {
    for (const resource of Object.values(requiredGcpExports)) {
      expect(resource).toBeTypeOf("function")
    }
  })
})
