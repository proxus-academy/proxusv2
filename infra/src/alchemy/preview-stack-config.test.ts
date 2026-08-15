import { describe, expect, it } from "vitest"
import { readPreviewStackConfig } from "./preview-stack-config.ts"

const digest = "a".repeat(64)
const valid: NodeJS.ProcessEnv = {
  GCP_PROJECT_ID: "proxus-v2", GCP_PROJECT_NUMBER: "123456", GCP_REGION: "europe-southwest1", PR_NUMBER: "42",
  GCP_PREVIEW_DEPLOYER_PRINCIPAL: "serviceAccount:preview-deployer@proxus-v2.iam.gserviceaccount.com",
  IMAGE_PUBLIC_API: `europe-southwest1-docker.pkg.dev/proxus-v2/proxus/server@sha256:${digest}`,
  IMAGE_ADMIN_API: `europe-southwest1-docker.pkg.dev/proxus-v2/proxus/admin-server@sha256:${digest}`,
  IMAGE_WEB: `europe-southwest1-docker.pkg.dev/proxus-v2/proxus/web@sha256:${digest}`,
  IMAGE_ADMIN_WEB: `europe-southwest1-docker.pkg.dev/proxus-v2/proxus/admin-web@sha256:${digest}`,
  AUTH_GOOGLE_SIGNING_SECRET_ID: "auth-signing",
  OBJECT_STORAGE_SIGNING_SECRET_ID: "object-signing", MAILGUN_API_KEY_SECRET_ID: "mailgun-key",
  DATABASE_BOOTSTRAP_PASSWORD_SECRET_ID: "preview-database-bootstrap-password",
  MAILGUN_DOMAIN: "mail.example.test", MAILGUN_FROM: "Proxus <noreply@example.test>",
  ANALYTICS_PROJECT_ID: "proxus-v2", ANALYTICS_DATASET: "analytics", ANALYTICS_TABLE: "events",
  IAP_ACCESS_PRINCIPAL: "group:preview@example.test", CLOUD_SQL_PROJECT_ID: "proxus-v2",
  CLOUD_SQL_INSTANCE_NAME: "preview-shared", CLOUD_SQL_CONNECTION_NAME: "proxus-v2:europe-southwest1:preview-shared",
  DEPLOY_SERVICES: "false", ALCHEMY_STACK_NAME: "preview", ALCHEMY_STAGE: "pr-42",
  ALCHEMY_STATE_BUCKET: "proxus-v2-pulumi-state",
  ALCHEMY_STATE_KMS_KEY: "projects/proxus-v2/locations/europe-southwest1/keyRings/pulumi-state/cryptoKeys/pulumi-secrets",
  ALCHEMY_LEASE_OWNER: "runner", ALCHEMY_LEASE_ID: "lease", ALCHEMY_LEASE_GENERATION: "7", ALCHEMY_LEASE_EXPIRES_AT: "2000000000000",
}

describe("preview Alchemy stack config", () => {
  it("parses typed pr-N inputs and the externally acquired lease", () => {
    expect(readPreviewStackConfig(valid)).toMatchObject({
      stage: "pr-42", prNumber: 42, deployServices: false, projectNumber: "123456",
      cloudSql: { name: "preview-shared" }, lease: { stack: "preview", stage: "pr-42", generation: "7" },
      mailgun: { domain: "mail.example.test", from: "Proxus <noreply@example.test>" },
    })
  })

  it.each(["preview-42", "pr-41", "pr-042"])("rejects stage %s when PR_NUMBER is 42", (stage) => {
    expect(() => readPreviewStackConfig({ ...valid, ALCHEMY_STAGE: stage })).toThrow("ALCHEMY_STAGE must be pr-42")
  })

  it("rejects tags instead of immutable image digests", () => {
    expect(() => readPreviewStackConfig({ ...valid, IMAGE_WEB: "europe-southwest1-docker.pkg.dev/proxus-v2/proxus/web:latest" })).toThrow(
      "IMAGE_WEB must be an immutable Artifact Registry digest",
    )
  })

  it.each([
    ["MAILGUN_DOMAIN", "https://mail.example.test", "valid lower-case DNS hostname"],
    ["MAILGUN_FROM", "Proxus\nBcc: victim@example.test", "without line breaks"],
  ])("rejects invalid %s", (name, value, message) => {
    expect(() => readPreviewStackConfig({ ...valid, [name]: value })).toThrow(message)
  })

  it("accepts an individual user and rejects every other IAM principal kind", () => {
    expect(readPreviewStackConfig({ ...valid, IAP_ACCESS_PRINCIPAL: "user:javier@proxus.es" }).iapAccessPrincipal).toBe("user:javier@proxus.es")
    for (const principal of ["allUsers", "allAuthenticatedUsers", "serviceAccount:iap@example.test", "domain:example.test", "projectOwner:proxus-v2", "user:invalid"]) {
      expect(() => readPreviewStackConfig({ ...valid, IAP_ACCESS_PRINCIPAL: principal })).toThrow("must be user:<email> or group:<email>")
    }
  })

  it("requires an explicit external lock for this stack and stage", () => {
    expect(() => readPreviewStackConfig({ ...valid, ALCHEMY_LEASE_ID: "" })).toThrow("ALCHEMY_LEASE_ID is required")
    expect(() => readPreviewStackConfig({ ...valid, ALCHEMY_STACK_NAME: "other" })).toThrow("ALCHEMY_STACK_NAME must be preview")
  })
})
