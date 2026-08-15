import { describe, expect, it } from "vitest"
import { readPreviewPlatformStackConfig } from "./preview-platform-config.ts"

const valid = {
  GCP_PROJECT_ID: "proxus-v2",
  GCP_REGION: "europe-southwest1",
  ALCHEMY_STATE_BUCKET: "proxus-v2-alchemy-state",
  ALCHEMY_STATE_KMS_KEY: "projects/proxus-v2/locations/europe-southwest1/keyRings/alchemy/cryptoKeys/state",
  ALCHEMY_STACK_NAME: "preview-platform",
  ALCHEMY_STAGE: "production",
  ALCHEMY_LEASE_OWNER: "runner-1",
  ALCHEMY_LEASE_ID: "lease-1",
  ALCHEMY_LEASE_GENERATION: "42",
  ALCHEMY_LEASE_EXPIRES_AT: "2000000000000",
}

describe("preview-platform stack config", () => {
  it("parses the minimal typed config and externally acquired lease", () => {
    expect(readPreviewPlatformStackConfig(valid)).toMatchObject({
      project: "proxus-v2",
      region: "europe-southwest1",
      lease: { stack: "preview-platform", stage: "production", generation: "42" },
    })
  })

  it("rejects a lease for another stack", () => {
    expect(() => readPreviewPlatformStackConfig({ ...valid, ALCHEMY_STACK_NAME: "other" })).toThrow(
      "ALCHEMY_STACK_NAME must be preview-platform",
    )
  })

  it("rejects an invalid expiry without contacting GCP", () => {
    expect(() => readPreviewPlatformStackConfig({ ...valid, ALCHEMY_LEASE_EXPIRES_AT: "soon" })).toThrow(
      "ALCHEMY_LEASE_EXPIRES_AT must be a positive integer",
    )
  })
})
