import { isIapAccessPrincipal, type IapAccessPrincipal } from "./iap-access-principal.ts"
import { createHash } from "node:crypto"
// Entrypoint configuration must synchronously load and authenticate the manifest before Stack starts.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { readFileSync } from "node:fs"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { dirname, isAbsolute, resolve } from "node:path"
import { Project } from "@microagi/alchemy-gcp"
import * as Data from "effect/Data"
import { asOutput, type Output } from "alchemy/Output"
import type { ArtifactManifest } from "./components/production-website.ts"
import type { ProductionRuntimeProps } from "./components/production-runtime.ts"
import type { Lease } from "./state/lease-lock.ts"

export interface ProductionStackConfig {
  readonly project: string
  readonly projectNumber: string
  readonly region: string
  readonly productionDeployer: string
  readonly deployServices: boolean
  readonly applicationRuntimeReady: boolean
  readonly images: ProductionRuntimeProps["images"] & { readonly web: string }
  readonly secrets: ProductionRuntimeProps["secrets"]
  readonly analytics: ProductionRuntimeProps["analytics"]
  readonly mailgun: ProductionRuntimeProps["mailgun"]
  readonly domain: string
  readonly bucketName: string
  readonly iapAccessPrincipal: IapAccessPrincipal
  readonly manifest: ArtifactManifest
  readonly stateBucket: string
  readonly kmsKeyName: string
  readonly lease: Lease
}
class ProductionStackConfigError extends Data.TaggedError("ProductionStackConfigError")<{ readonly message: string }> {}
const fail = (message: string): never => { throw new ProductionStackConfigError({ message }) }
const required = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || fail(`${name} is required`)
const bool = (env: NodeJS.ProcessEnv, name: string) => { const value = required(env, name); return value === "true" ? true : value === "false" ? false : fail(`${name} must be true or false`) }
const secret = (env: NodeJS.ProcessEnv, name: string) => { const value = required(env, name); return /^[A-Za-z0-9_-]{1,255}$/.test(value) ? value : fail(`${name} must be a Secret Manager secret ID`) }
const image = (env: NodeJS.ProcessEnv, name: string, project: string, region: string) => {
  const value = required(env, name); const prefix = `${region}-docker.pkg.dev/${project}/`
  return value.startsWith(prefix) && /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value.slice(prefix.length)) ? value : fail(`${name} must be an immutable Artifact Registry digest for the configured project and region`)
}
const manifest = (env: NodeJS.ProcessEnv): ArtifactManifest => {
  const manifestPath = resolve(required(env, "STATIC_MANIFEST_JSON_PATH")); const expected = required(env, "STATIC_MANIFEST_SHA256")
  if (!/^[a-f0-9]{64}$/.test(expected)) fail("STATIC_MANIFEST_SHA256 must be a lowercase sha256")
  let bytes: Buffer
  try { bytes = readFileSync(manifestPath) } catch { return fail("STATIC_MANIFEST_JSON_PATH must identify a readable precomputed manifest") }
  if (createHash("sha256").update(bytes).digest("hex") !== expected) fail("STATIC_MANIFEST_SHA256 does not match the precomputed manifest")
  let parsed: unknown
  try { parsed = JSON.parse(bytes.toString("utf8")) } catch { return fail("STATIC_MANIFEST_JSON_PATH must contain valid JSON") }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { files?: unknown }).files)) fail("static manifest must contain a files array")
  const base = dirname(manifestPath)
  return { files: (parsed as { files: unknown[] }).files.map((entry) => {
    if (typeof entry !== "object" || entry === null) return fail("static manifest entries must be objects")
    const file = entry as Record<string, unknown>
    if (typeof file.name !== "string" || typeof file.path !== "string" || typeof file.sha256 !== "string" || typeof file.size !== "number") fail("static manifest entries require name, path, sha256 and size")
    const name = file.name as string, path = file.path as string, sha256 = file.sha256 as string, size = file.size as number
    return { name, path: isAbsolute(path) ? path : resolve(base, path), sha256, size }
  }) }
}
export const readProductionStackConfig = (env: NodeJS.ProcessEnv): ProductionStackConfig => {
  const project = required(env, "GCP_PROJECT_ID"), region = required(env, "GCP_REGION")
  const stack = required(env, "ALCHEMY_STACK_NAME"), stage = required(env, "ALCHEMY_STAGE")
  if (stack !== "production" || stage !== "production") fail("ALCHEMY_STACK_NAME and ALCHEMY_STAGE must both be production")
  const deployServices = bool(env, "DEPLOY_SERVICES"), applicationRuntimeReady = bool(env, "APPLICATION_RUNTIME_READY")
  if (deployServices && !applicationRuntimeReady) fail("APPLICATION_RUNTIME_READY must be true before production services are deployed")
  const expiresAt = Number(required(env, "ALCHEMY_LEASE_EXPIRES_AT")); if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) fail("ALCHEMY_LEASE_EXPIRES_AT must be a positive integer")
  const iapAccessPrincipal = required(env, "IAP_ACCESS_PRINCIPAL"); if (!isIapAccessPrincipal(iapAccessPrincipal)) fail("IAP_ACCESS_PRINCIPAL must be user:<email> or group:<email>")
  const productionDeployer = required(env, "GCP_PRODUCTION_DEPLOYER_PRINCIPAL"); if (!/^serviceAccount:[^\s@]+@[^\s@]+$/.test(productionDeployer)) fail("GCP_PRODUCTION_DEPLOYER_PRINCIPAL must be a serviceAccount principal")
  const projectNumber = required(env, "GCP_PROJECT_NUMBER"); if (!/^[0-9]+$/.test(projectNumber)) fail("GCP_PROJECT_NUMBER must be numeric")
  return { project, projectNumber, region, productionDeployer, deployServices, applicationRuntimeReady,
    images: { publicApi: image(env,"IMAGE_PUBLIC_API",project,region), adminApi: image(env,"IMAGE_ADMIN_API",project,region), web: image(env,"IMAGE_WEB",project,region), adminWeb: image(env,"IMAGE_ADMIN_WEB",project,region) },
    secrets: { database: { name:"DATABASE_URL",secretId:secret(env,"DATABASE_SECRET_ID") }, authSigning:{name:"AUTH_GOOGLE_SIGNING_SECRET",secretId:secret(env,"AUTH_GOOGLE_SIGNING_SECRET_ID")}, objectStorageSigning:{name:"OBJECT_STORAGE_SIGNING_SECRET",secretId:secret(env,"OBJECT_STORAGE_SIGNING_SECRET_ID")}, mailgunApiKey:{name:"MAILGUN_API_KEY",secretId:secret(env,"MAILGUN_API_KEY_SECRET_ID")} },
    analytics:{project:required(env,"ANALYTICS_PROJECT_ID"),dataset:required(env,"ANALYTICS_DATASET"),table:required(env,"ANALYTICS_TABLE")}, mailgun:{domain:required(env,"MAILGUN_DOMAIN"),from:required(env,"MAILGUN_FROM")}, domain:required(env,"PRODUCTION_DOMAIN"), bucketName:required(env,"PRODUCTION_WEB_BUCKET"), iapAccessPrincipal:iapAccessPrincipal as IapAccessPrincipal, manifest:manifest(env), stateBucket:required(env,"ALCHEMY_STATE_BUCKET"), kmsKeyName:required(env,"ALCHEMY_STATE_KMS_KEY"), lease:{stack,stage,owner:required(env,"ALCHEMY_LEASE_OWNER"),leaseId:required(env,"ALCHEMY_LEASE_ID"),generation:required(env,"ALCHEMY_LEASE_GENERATION"),expiresAt} }
}
/** Cross-stack reference to the existing foundation project; this stack never declares a Project. */
export const productionProjectReference = (): Output<Project> =>
  asOutput(Project.ref("FoundationProject", { stack: "foundation", stage: "foundation" }))
