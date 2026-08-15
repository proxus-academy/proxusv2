// @effect-diagnostics nodeBuiltinImport:off
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const workflow = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, "../../.github/workflows", name), "utf8")

describe("preview workflow configuration", () => {
  it("contains no operand-less PR template checks", () => {
    for (const name of ["deploy-preview.yml", "reconcile-previews.yml"]) {
      expect(workflow(name)).not.toContain("[[ == *'{pr}'* ]]")
    }
  })

  it("validates the shared Cloud SQL connection name in both preview workflows", () => {
    const check = '[[ "$CLOUD_SQL_CONNECTION_NAME" == "$CLOUD_SQL_PROJECT_ID:$GCP_REGION:$CLOUD_SQL_INSTANCE_NAME" ]]'
    expect(workflow("deploy-preview.yml")).toContain(check)
    expect(workflow("reconcile-previews.yml")).toContain(check)
  })

  it("builds only the reviewed immutable SHA while executing build policy from trusted main", () => {
    const deploy = workflow("deploy-preview.yml")
    expect(deploy).toContain("Check out only trusted main IaC after authentication")
    expect(deploy).toContain("SOURCE_SHA: ${{ needs.authorize.outputs.sha }}")
    expect(deploy).toContain("SOURCE_REVISION: ${{ needs.authorize.outputs.sha }}")
    expect(deploy).toContain("SOURCE_URL: https://github.com/${{ github.repository }}.git")
    expect(deploy).toContain("run: infra/scripts/build-images.sh")
    expect(deploy).not.toContain("ref: ${{ needs.authorize.outputs.sha }}\n          path: trusted")
  })

  it("provides required Mailgun configuration to orphan preview destruction", () => {
    const reconcile = workflow("reconcile-previews.yml")
    expect(reconcile).toContain("MAILGUN_DOMAIN: ${{ vars.MAILGUN_DOMAIN }}")
    expect(reconcile).toContain("MAILGUN_FROM: ${{ vars.MAILGUN_FROM }}")
  })
})
