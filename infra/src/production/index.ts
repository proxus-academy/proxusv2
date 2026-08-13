import { createHash } from "node:crypto"
// Pulumi executes this program in Node and must read the pre-built static artifact.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { existsSync, readdirSync, statSync } from "node:fs"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { extname, join, relative, resolve, sep } from "node:path"
import * as gcp from "@pulumi/gcp"
import * as pulumi from "@pulumi/pulumi"
import { createIapService, createMigrationJob, createRuntimeIdentity, secretEnvironment, type CloudRunContainer } from "../components/cloud-run.ts"
import {
  assertStack,
  foundationStackReference,
  projectId,
  region,
  requireBigQueryIdentifier,
  requireBucketName,
  requireGroupPrincipal,
  requireImageDigest,
  requireSecretId,
} from "../config.ts"

assertStack("production")

const config = new pulumi.Config()
const project = projectId()
const location = region()
const labels = { system: "proxus-v2", environment: "production", managed_by: "pulumi" }
const deployServices = config.getBoolean("deployServices") ?? false
const runtimeReady = config.getBoolean("applicationRuntimeReady") ?? false
const domain = config.require("domain")
const iapPrincipal = requireGroupPrincipal(config, "iapPrincipal")
const databaseSecretId = requireSecretId(config, "databaseSecretId")
const authSigningSecretId = requireSecretId(config, "authSigningSecretId")
const objectStorageSigningSecretId = requireSecretId(config, "objectStorageSigningSecretId")
const productAnalyticsDataset = requireBigQueryIdentifier(config, "productAnalyticsDataset")
const productAnalyticsTable = requireBigQueryIdentifier(config, "productAnalyticsTable")
const publicImage = requireImageDigest(config, "publicImage", project, location)
const adminImage = requireImageDigest(config, "adminImage", project, location)
const adminWebImage = requireImageDigest(config, "adminWebImage", project, location)
const foundation = new pulumi.StackReference(foundationStackReference)
const projectNumber = foundation.requireOutput("projectNumber")
const deployerEmail = foundation.requireOutput("productionDeployerEmail")

if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
  throw new pulumi.RunError("domain must be a valid lower-case DNS hostname.")
}
if (deployServices && !runtimeReady) {
  throw new pulumi.RunError(
    "applicationRuntimeReady must be explicitly true before production services are created; production email/Google adapters and operational controls currently fail closed.",
  )
}

const publicRuntime = createRuntimeIdentity("public-runtime", {
  project,
  accountId: "proxus-production-public",
  displayName: "Proxus production public runtime",
  deployerEmail,
  databaseSecretId,
})
const adminRuntime = createRuntimeIdentity("admin-runtime", {
  project,
  accountId: "proxus-production-admin",
  displayName: "Proxus production admin runtime",
  deployerEmail,
  databaseSecretId,
})
const migrationRuntime = createRuntimeIdentity("migration-runtime", {
  project,
  accountId: "proxus-production-migrations",
  displayName: "Proxus production migration runtime",
  deployerEmail,
  databaseSecretId,
})

const grantSecret = (name: string, secretId: string, account: gcp.serviceaccount.Account) => new gcp.secretmanager.SecretIamMember(name, {
  project,
  secretId,
  role: "roles/secretmanager.secretAccessor",
  member: account.email.apply((email) => `serviceAccount:${email}`),
}, { dependsOn: [account] })
const publicAuthAccess = grantSecret("public-auth-secret", authSigningSecretId, publicRuntime.account)
const publicObjectAccess = grantSecret("public-object-secret", objectStorageSigningSecretId, publicRuntime.account)
const adminAuthAccess = grantSecret("admin-auth-secret", authSigningSecretId, adminRuntime.account)
const adminObjectAccess = grantSecret("admin-object-secret", objectStorageSigningSecretId, adminRuntime.account)
const grantAnalyticsWrite = (name: string, account: gcp.serviceaccount.Account) => new gcp.bigquery.DatasetIamMember(name, {
  project,
  datasetId: productAnalyticsDataset,
  role: "roles/bigquery.dataEditor",
  member: account.email.apply((email) => `serviceAccount:${email}`),
}, { dependsOn: [account] })
const publicAnalyticsWrite = grantAnalyticsWrite("public-analytics-writer", publicRuntime.account)
const adminAnalyticsWrite = grantAnalyticsWrite("admin-analytics-writer", adminRuntime.account)

const migration = createMigrationJob("migrations", {
  project,
  location,
  jobName: "proxus-production-migrations",
  image: publicImage,
  runtimeServiceAccount: migrationRuntime.account.email,
  databaseSecretId,
  labels,
  deletionProtection: true,
  dependsOn: migrationRuntime.databaseAccess === undefined
    ? [migrationRuntime.deployerCanUse]
    : [migrationRuntime.deployerCanUse, migrationRuntime.databaseAccess],
})

const backendEnvironment = [
  { name: "NODE_ENV", value: "production" },
  { name: "HOST", value: "0.0.0.0" },
  secretEnvironment("DATABASE_URL", databaseSecretId),
  secretEnvironment("AUTH_GOOGLE_SIGNING_SECRET", authSigningSecretId),
  secretEnvironment("OBJECT_STORAGE_SIGNING_SECRET", objectStorageSigningSecretId),
  { name: "AUTH_EMAIL_ADAPTER", value: "real" },
  { name: "AUTH_GOOGLE_ADAPTER", value: "real" },
  { name: "DATABASE_MIGRATIONS_DIR", value: "/app/drizzle" },
  { name: "PRODUCT_ANALYTICS_GCP_PROJECT", value: project },
  { name: "PRODUCT_ANALYTICS_BIGQUERY_DATASET", value: productAnalyticsDataset },
  { name: "PRODUCT_ANALYTICS_BIGQUERY_TABLE", value: productAnalyticsTable },
]
const backend = (name: string, image: string, port: number, ingress = false): CloudRunContainer => ({
  name,
  image,
  ...(ingress ? { ports: { containerPort: port } } : {}),
  envs: [...backendEnvironment, ...(ingress ? [] : [{ name: "PORT", value: String(port) }])],
  resources: { limits: { cpu: "1", memory: "512Mi" }, cpuIdle: true, startupCpuBoost: true },
  startupProbe: { tcpSocket: { port }, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 30 },
})
const frontend = (image: string): CloudRunContainer => ({
  name: "frontend",
  image,
  dependsOns: ["public-api", "admin-api"],
  ports: { containerPort: 8080 },
  envs: [
    { name: "PUBLIC_API_ORIGIN", value: "http://localhost:3000" },
    { name: "ADMIN_API_ORIGIN", value: "http://localhost:3001" },
  ],
  resources: { limits: { cpu: "1", memory: "256Mi" }, cpuIdle: true, startupCpuBoost: true },
  startupProbe: { tcpSocket: { port: 8080 }, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 15 },
})

const publicApi = deployServices ? new gcp.cloudrunv2.Service("public-api", {
  project,
  location,
  name: "proxus-production-public-api",
  description: "Public API reached only through the production HTTPS load balancer",
  deletionProtection: true,
  ingress: "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
  invokerIamDisabled: true,
  labels,
  scaling: { maxInstanceCount: 10 },
  template: {
    serviceAccount: publicRuntime.account.email,
    timeout: "60s",
    maxInstanceRequestConcurrency: 80,
    containers: [backend("public-api", publicImage, 8080, true)],
  },
}, { dependsOn: [
  publicRuntime.deployerCanUse,
  ...(publicRuntime.databaseAccess === undefined ? [] : [publicRuntime.databaseAccess]),
  publicAuthAccess,
  publicObjectAccess,
  publicAnalyticsWrite,
  migration,
] }) : undefined

const admin = deployServices ? createIapService("admin", {
  project,
  projectNumber,
  location,
  serviceName: "proxus-production-admin",
  runtimeServiceAccount: adminRuntime.account.email,
  iapPrincipal,
  containers: [
    frontend(adminWebImage),
    backend("public-api", publicImage, 3000),
    backend("admin-api", adminImage, 3001),
  ],
  labels,
  maxInstances: 3,
  deletionProtection: true,
  dependsOn: [
    adminRuntime.deployerCanUse,
    ...(adminRuntime.databaseAccess === undefined ? [] : [adminRuntime.databaseAccess]),
    adminAuthAccess,
    adminObjectAccess,
    adminAnalyticsWrite,
    migration,
  ],
}) : undefined

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}
const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : []
})

let websiteBucket: gcp.storage.Bucket | undefined
let websiteIp: pulumi.Output<string> | undefined
if (deployServices) {
  const webDistPath = resolve(config.require("webDistPath"))
  if (!existsSync(join(webDistPath, "index.html")) || !statSync(webDistPath).isDirectory()) {
    throw new pulumi.RunError(`webDistPath must contain a built index.html: ${webDistPath}`)
  }

  websiteBucket = new gcp.storage.Bucket("website", {
    project,
    location: "EU",
    name: requireBucketName(config, "websiteBucketName"),
    uniformBucketLevelAccess: true,
    publicAccessPrevention: "enforced",
    forceDestroy: false,
    versioning: { enabled: true },
    website: { mainPageSuffix: "index.html", notFoundPage: "index.html" },
    labels,
  }, { protect: true })

  for (const file of walk(webDistPath)) {
    const objectName = relative(webDistPath, file).split(sep).join("/")
    const id = createHash("sha256").update(objectName).digest("hex").slice(0, 16)
    new gcp.storage.BucketObject(`web-${id}`, {
      bucket: websiteBucket.name,
      name: objectName,
      source: new pulumi.asset.FileAsset(file),
      contentType: contentTypes[extname(file)] ?? "application/octet-stream",
      cacheControl: objectName === "index.html" ? "no-cache, max-age=0" : "public, max-age=31536000, immutable",
    })
  }

  const backendBucket = new gcp.compute.BackendBucket("website", {
    project,
    name: "proxus-production-website",
    bucketName: websiteBucket.name,
    enableCdn: true,
    compressionMode: "AUTOMATIC",
    cdnPolicy: {
      cacheMode: "USE_ORIGIN_HEADERS",
      negativeCaching: true,
      serveWhileStale: 86400,
    },
  })
  const cdnServiceIdentity = new gcp.projects.ServiceIdentity("cloud-cdn-service-agent", {
    project,
    service: "cloudcdn.googleapis.com",
  })
  new gcp.storage.BucketIAMMember("website-load-balancer-reader", {
    bucket: websiteBucket.name,
    role: "roles/storage.objectViewer",
    member: cdnServiceIdentity.member,
  }, { dependsOn: [backendBucket, cdnServiceIdentity] })

  if (publicApi === undefined) throw new pulumi.RunError("public API was not created")
  const apiNeg = new gcp.compute.RegionNetworkEndpointGroup("public-api", {
    project,
    region: location,
    name: "proxus-production-public-api",
    networkEndpointType: "SERVERLESS",
    cloudRun: { service: publicApi.name },
  })
  const apiBackend = new gcp.compute.BackendService("public-api", {
    project,
    name: "proxus-production-public-api",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    protocol: "HTTP",
    timeoutSec: 60,
    backends: [{ group: apiNeg.id }],
  })
  const urlMap = new gcp.compute.URLMap("website", {
    project,
    name: "proxus-production",
    defaultService: backendBucket.id,
    hostRules: [{ hosts: [domain], pathMatcher: "application" }],
    pathMatchers: [{
      name: "application",
      defaultService: backendBucket.id,
      routeRules: [{
        priority: 1,
        matchRules: [{ prefixMatch: "/api" }],
        service: apiBackend.id,
      }],
    }],
  })
  const certificate = new gcp.compute.ManagedSslCertificate("website", {
    project,
    name: "proxus-production",
    managed: { domains: [domain] },
  })
  const proxy = new gcp.compute.TargetHttpsProxy("website", {
    project,
    name: "proxus-production",
    urlMap: urlMap.id,
    sslCertificates: [certificate.id],
  })
  const address = new gcp.compute.GlobalAddress("website", {
    project,
    name: "proxus-production",
  })
  new gcp.compute.GlobalForwardingRule("website-https", {
    project,
    name: "proxus-production-https",
    ipAddress: address.address,
    portRange: "443",
    target: proxy.id,
    loadBalancingScheme: "EXTERNAL_MANAGED",
  })
  websiteIp = address.address
}

export const migrationJobName = migration.name
export const publicApiUrl = publicApi?.uri
export const adminUrl = admin?.service.uri
export const websiteBucketName = websiteBucket?.name
export const websiteAddress = websiteIp
export const requiredDnsARecord = websiteIp === undefined ? undefined : pulumi.interpolate`${domain} A ${websiteIp}`
