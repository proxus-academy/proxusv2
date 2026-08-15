import { createHash } from "node:crypto"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { readProductionStackConfig } from "./production-stack-config.ts"

const digest = "a".repeat(64)
const environment = () => {
  const directory = mkdtempSync(join(tmpdir(), "proxus-production-"))
  const json = JSON.stringify({ files: [{ name: "index.html", path: "site/index.html", sha256: "b".repeat(64), size: 12 }] })
  const path = join(directory, "manifest.json"); writeFileSync(path, json)
  return { GCP_PROJECT_ID:"proxus-v2",GCP_PROJECT_NUMBER:"123456",GCP_REGION:"europe-southwest1",GCP_PRODUCTION_DEPLOYER_PRINCIPAL:"serviceAccount:production@proxus-v2.iam.gserviceaccount.com", IMAGE_PUBLIC_API:`europe-southwest1-docker.pkg.dev/proxus-v2/proxus/server@sha256:${digest}`,IMAGE_ADMIN_API:`europe-southwest1-docker.pkg.dev/proxus-v2/proxus/admin@sha256:${digest}`,IMAGE_WEB:`europe-southwest1-docker.pkg.dev/proxus-v2/proxus/web@sha256:${digest}`,IMAGE_ADMIN_WEB:`europe-southwest1-docker.pkg.dev/proxus-v2/proxus/admin-web@sha256:${digest}`, DATABASE_SECRET_ID:"production-db",AUTH_GOOGLE_SIGNING_SECRET_ID:"auth",OBJECT_STORAGE_SIGNING_SECRET_ID:"objects",MAILGUN_API_KEY_SECRET_ID:"mailgun",ANALYTICS_PROJECT_ID:"proxus-v2",ANALYTICS_DATASET:"analytics",ANALYTICS_TABLE:"events",MAILGUN_DOMAIN:"mg.example.com",MAILGUN_FROM:"Proxus <hello@example.com>",PRODUCTION_DOMAIN:"app.example.com",PRODUCTION_WEB_BUCKET:"proxus-production-web",IAP_ACCESS_PRINCIPAL:"group:admins@example.com",DEPLOY_SERVICES:"false",APPLICATION_RUNTIME_READY:"false",STATIC_MANIFEST_JSON_PATH:path,STATIC_MANIFEST_SHA256:createHash("sha256").update(json).digest("hex"),ALCHEMY_STACK_NAME:"production",ALCHEMY_STAGE:"production",ALCHEMY_STATE_BUCKET:"state",ALCHEMY_STATE_KMS_KEY:"projects/proxus-v2/locations/europe-southwest1/keyRings/state/cryptoKeys/key",ALCHEMY_LEASE_OWNER:"runner",ALCHEMY_LEASE_ID:"lease",ALCHEMY_LEASE_GENERATION:"1",ALCHEMY_LEASE_EXPIRES_AT:"2000000000000" } satisfies NodeJS.ProcessEnv
}
describe("production Alchemy stack config", () => {
  it("parses typed inputs and resolves precomputed manifest paths", () => { const env=environment(); const result=readProductionStackConfig(env); expect(result).toMatchObject({deployServices:false,projectNumber:"123456",lease:{stack:"production",stage:"production"},manifest:{files:[{name:"index.html",path:join(join(env.STATIC_MANIFEST_JSON_PATH!,".."),"site/index.html")}]}}) })
  it("requires the operational runtime gate", () => expect(() => readProductionStackConfig({...environment(),DEPLOY_SERVICES:"true"})).toThrow("APPLICATION_RUNTIME_READY must be true"))
  it("requires the production entrypoint identity and external lease environment", () => {
    expect(() => readProductionStackConfig({ ...environment(), ALCHEMY_STAGE: "pr-42" })).toThrow("must both be production")
    expect(() => readProductionStackConfig({ ...environment(), ALCHEMY_LEASE_ID: undefined })).toThrow("ALCHEMY_LEASE_ID is required")
    expect(() => readProductionStackConfig({ ...environment(), ALCHEMY_LEASE_EXPIRES_AT: "expired" })).toThrow("must be a positive integer")
  })
  it("rejects image tags and a changed manifest", () => { expect(() => readProductionStackConfig({...environment(),IMAGE_WEB:"europe-southwest1-docker.pkg.dev/proxus-v2/proxus/web:latest"})).toThrow("immutable Artifact Registry digest"); expect(() => readProductionStackConfig({...environment(),STATIC_MANIFEST_SHA256:"0".repeat(64)})).toThrow("does not match") })
})
