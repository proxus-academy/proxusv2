// @effect-diagnostics nodeBuiltinImport:off
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/deploy-bootstrap.yml"), "utf8")
const wrapper = "pnpm --filter @proxus/infra alchemy:infra --"

describe("manual Alchemy bootstrap workflow contract", () => {
  it("is manual, protected, serialized with foundation, and trusts exact main before WIF", () => {
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).not.toMatch(/^\s+(push|pull_request|pull_request_target|schedule):/m)
    expect(workflow).toContain("environment: foundation")
    expect(workflow).toContain("group: alchemy-foundation")
    expect(workflow).toContain("cancel-in-progress: false")
    expect(workflow).toContain('test "$SOURCE_REF" = refs/heads/main')
    expect(workflow).toContain('test "$WORKFLOW_SHA" = "$SOURCE_SHA"')
    expect(workflow).toContain('test "$DEPLOY_CONFIRMATION" = "DEPLOY ALCHEMY BOOTSTRAP"')
    const checkout = workflow.indexOf("Check out the authorized main commit before authentication")
    const verify = workflow.indexOf("Verify trusted checkout and physical adoption IDs before authentication")
    const auth = workflow.indexOf("Authenticate as the foundation deployer without a key")
    expect(checkout).toBeGreaterThan(-1)
    expect(verify).toBeGreaterThan(checkout)
    expect(auth).toBeGreaterThan(verify)
    expect(workflow).toContain("id-token: write")
    expect(workflow).not.toMatch(/service_account_key|credentials_json|\.json['\"]?\s*:\s*\$\{\{\s*secrets/i)
  })

  it("uses ephemeral local bootstrap operations, explicit physical adoption, and never destroy", () => {
    for (const name of ["ALCHEMY_STATE_BUCKET", "ALCHEMY_STATE_KEY_RING_ID", "ALCHEMY_STATE_CRYPTO_KEY_ID", "GCP_OPERATOR_PRINCIPAL"]) expect(workflow).toContain(name)
    expect(workflow).toContain(`${wrapper} plan --stage bootstrap`)
    expect(workflow).toContain(`${wrapper} deploy --stage bootstrap`)
    expect(workflow).toContain(`${wrapper} deploy --stage bootstrap --adopt`)
    expect(workflow).toContain(`${wrapper} outputs --stage bootstrap`)
    expect(workflow).not.toContain(`${wrapper} destroy`)
    expect(workflow).toContain('test "$ADOPTION_CONFIRMATION" = "ADOPT EXISTING BOOTSTRAP"')
    expect(workflow).toContain("exceptional ephemeral local state")
    expect(workflow).toContain("local state is ephemeral and is not persisted by this workflow")
  })

  it("only summarizes the allowlisted bucket and KMS key", () => {
    expect(workflow).toContain(".bucket | strings")
    expect(workflow).toContain(".key | strings")
    expect(workflow).not.toContain('cat "$output"')
    expect(workflow).toContain("Only the explicit non-secret output allowlist above")
  })
})
