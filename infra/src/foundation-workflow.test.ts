// @effect-diagnostics nodeBuiltinImport:off
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/deploy-foundation.yml"), "utf8")
const wrapper = "pnpm --filter @proxus/infra alchemy:infra --"

describe("manual Alchemy foundation workflow contract", () => {
  it("is manual, protected and exclusively serialized", () => {
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).toContain("action:")
    expect(workflow).toContain("adoptExisting:")
    expect(workflow).toContain("type: boolean")
    expect(workflow).not.toMatch(/^\s+(push|pull_request|pull_request_target|schedule):/m)
    expect(workflow).toContain("environment: foundation")
    expect(workflow).toContain("group: alchemy-foundation")
    expect(workflow).toContain("cancel-in-progress: false")
  })

  it("authorizes exact main code and adoption confirmation before WIF", () => {
    expect(workflow).toContain('test "$SOURCE_REF" = refs/heads/main')
    expect(workflow).toContain('test "$WORKFLOW_SHA" = "$SOURCE_SHA"')
    expect(workflow).toContain('test "$ADOPTION_CONFIRMATION" = "ADOPT EXISTING FOUNDATION"')
    const checkout = workflow.indexOf("Check out the authorized main commit before authentication")
    const verify = workflow.indexOf("Verify trusted checkout and physical resource configuration before authentication")
    const auth = workflow.indexOf("Authenticate as the foundation deployer without a key")
    expect(checkout).toBeGreaterThan(0)
    expect(verify).toBeGreaterThan(checkout)
    expect(auth).toBeGreaterThan(verify)
    expect(workflow).not.toMatch(/service_account_key|credentials_json|\.json['\"]?\s*:\s*\$\{\{\s*secrets/i)
  })

  it("uses explicit physical IDs and the leased GCS/KMS wrapper without destroy", () => {
    for (const name of ["GCP_PROJECT_ID", "GCP_PROJECT_NUMBER", "GCP_PROJECT_DISPLAY_NAME", "GCP_PROJECT_PARENT_TYPE", "GCP_PROJECT_PARENT_ID", "GCP_CLOUD_BUILD_SOURCE_BUCKET", "GCP_CLOUD_BUILD_SOURCE_BUCKET_LOCATION", "ALCHEMY_STATE_BUCKET", "ALCHEMY_STATE_KMS_KEY"]) expect(workflow).toContain(name)
    expect(workflow).toContain(`${wrapper} plan --stage foundation --adopt-existing`)
    expect(workflow).toContain(`${wrapper} deploy --stage foundation --adopt-existing`)
    expect(workflow).toContain(`${wrapper} outputs --stage foundation --adopt-existing`)
    expect(workflow).not.toContain(`${wrapper} destroy`)
    expect(workflow).toContain("keyRings/[A-Za-z0-9_-]+/cryptoKeys/[A-Za-z0-9_-]+")
  })

  it("always plans, gates deploy and allowlists outputs", () => {
    expect(workflow).toContain("if: inputs.action == 'deploy'")
    for (const output of [".projectId", ".projectNumber", ".region", ".cloudBuildSourceBucket", ".artifactRegistryRepository"]) expect(workflow).toContain(output)
    expect(workflow).not.toContain('cat "$output"')
  })
})
