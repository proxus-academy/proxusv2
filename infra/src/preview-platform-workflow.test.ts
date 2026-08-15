// @effect-diagnostics nodeBuiltinImport:off
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/deploy-preview-platform.yml"),
  "utf8",
)

describe("manual preview-platform workflow contract", () => {
  it("is manual, protected and serialized with the preview lifecycle", () => {
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).toContain("options:\n          - plan\n          - deploy")
    expect(workflow).not.toMatch(/^\s+(push|pull_request|pull_request_target|schedule):/m)
    expect(workflow).toContain("environment: preview")
    expect(workflow).toContain("group: preview-lifecycle")
    expect(workflow).toContain("cancel-in-progress: false")
  })

  it("verifies trusted main code before obtaining keyless WIF credentials", () => {
    expect(workflow).toContain('test "$SOURCE_REF" = refs/heads/main')
    expect(workflow).toContain('test "$WORKFLOW_SHA" = "$SOURCE_SHA"')
    const checkout = workflow.indexOf("Check out the authorized main commit before authentication")
    const verify = workflow.indexOf("Verify trusted checkout and non-secret configuration before authentication")
    const auth = workflow.indexOf("Authenticate as the preview deployer without a key")
    expect(checkout).toBeGreaterThan(0)
    expect(verify).toBeGreaterThan(checkout)
    expect(auth).toBeGreaterThan(verify)
    expect(workflow).toContain("id-token: write")
    expect(workflow).toContain("GCP_PREVIEW_WORKLOAD_IDENTITY_PROVIDER")
    expect(workflow).not.toMatch(/service_account_key|credentials_json|\.json['\"]?\s*:\s*\$\{\{\s*secrets/i)
  })

  it("uses only the leased wrapper, always plans, never destroys, and allowlists outputs", () => {
    const wrapper = "pnpm --filter @proxus/infra alchemy:infra --"
    expect(workflow).toContain(`${wrapper} plan --stage preview-platform`)
    expect(workflow).toContain(`${wrapper} deploy --stage preview-platform`)
    expect(workflow).toContain(`${wrapper} outputs --stage preview-platform`)
    expect(workflow).not.toContain(`${wrapper} destroy`)
    expect(workflow).toContain("if: inputs.operation == 'deploy'")
    for (const output of [".project", ".region", ".instanceName", ".connectionName"]) {
      expect(workflow).toContain(output)
    }
    expect(workflow).not.toContain("cat \"$output\"")
  })

  it("validates required state, KMS and optional instance configuration", () => {
    for (const name of [
      "GCP_PROJECT_ID",
      "GCP_REGION",
      "ALCHEMY_STATE_BUCKET",
      "ALCHEMY_STATE_KMS_KEY",
      "PREVIEW_PLATFORM_INSTANCE_NAME",
    ]) expect(workflow).toContain(name)
    expect(workflow).toContain("keyRings/[A-Za-z0-9_-]+/cryptoKeys/[A-Za-z0-9_-]+")
  })
})
