import * as gcp from "@pulumi/gcp"
import * as pulumi from "@pulumi/pulumi"
import { createIapService, createMigrationJob, createRuntimeIdentity, secretEnvironment, type CloudRunContainer } from "../components/cloud-run.ts"
import {
  foundationStackReference,
  projectId,
  region,
  requireBigQueryIdentifier,
  requireGroupPrincipal,
  requireImageDigest,
  requirePrNumber,
  requireSecretId,
} from "../config.ts"

const config = new pulumi.Config()
const project = projectId()
const location = region()
const prNumber = requirePrNumber(config)
const prefix = `proxus-pr-${prNumber}`
const labels = { system: "proxus-v2", environment: "preview", pr: String(prNumber), managed_by: "pulumi" }
const deployServices = config.getBoolean("deployServices") ?? false
const runtimeReady = config.getBoolean("applicationRuntimeReady") ?? false
const iapPrincipal = requireGroupPrincipal(config, "iapPrincipal")
const databaseSecretId = requireSecretId(config, "databaseSecretId")
const authSigningSecretId = requireSecretId(config, "authSigningSecretId")
const objectStorageSigningSecretId = requireSecretId(config, "objectStorageSigningSecretId")
const productAnalyticsDataset = requireBigQueryIdentifier(config, "productAnalyticsDataset")
const productAnalyticsTable = requireBigQueryIdentifier(config, "productAnalyticsTable")
const publicImage = requireImageDigest(config, "publicImage", project, location)
const adminImage = requireImageDigest(config, "adminImage", project, location)
const webImage = requireImageDigest(config, "webImage", project, location)
const adminWebImage = requireImageDigest(config, "adminWebImage", project, location)
const foundation = new pulumi.StackReference(foundationStackReference)
const projectNumber = foundation.requireOutput("projectNumber")
const deployerEmail = foundation.requireOutput("previewDeployerEmail")

if (deployServices && !runtimeReady) {
  throw new pulumi.RunError(
    "applicationRuntimeReady must be explicitly true before creating preview services; production email/Google adapters and runtime configuration currently fail closed.",
  )
}

const runtime = createRuntimeIdentity("runtime", {
  project,
  accountId: `${prefix}-runtime`,
  displayName: `Proxus PR ${prNumber} runtime`,
  deployerEmail,
  databaseSecretId,
})

const grantSecret = (name: string, secretId: string) => new gcp.secretmanager.SecretIamMember(name, {
  project,
  secretId,
  role: "roles/secretmanager.secretAccessor",
  member: runtime.account.email.apply((email) => `serviceAccount:${email}`),
}, { dependsOn: [runtime.account] })
const authSecretAccess = grantSecret("auth-signing-secret", authSigningSecretId)
const objectSecretAccess = grantSecret("object-signing-secret", objectStorageSigningSecretId)
const analyticsWrite = new gcp.bigquery.DatasetIamMember("analytics-writer", {
  project,
  datasetId: productAnalyticsDataset,
  role: "roles/bigquery.dataEditor",
  member: runtime.account.email.apply((email) => `serviceAccount:${email}`),
}, { dependsOn: [runtime.account] })
const identityDependencies: pulumi.Resource[] = [
  runtime.deployerCanUse,
  authSecretAccess,
  objectSecretAccess,
  analyticsWrite,
]
if (runtime.databaseAccess !== undefined) identityDependencies.push(runtime.databaseAccess)

const migration = createMigrationJob("migrations", {
  project,
  location,
  jobName: `${prefix}-migrations`,
  image: publicImage,
  runtimeServiceAccount: runtime.account.email,
  databaseSecretId,
  labels,
  deletionProtection: false,
  dependsOn: identityDependencies,
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

const backend = (name: string, image: string, port: number): CloudRunContainer => ({
  name,
  image,
  envs: [...backendEnvironment, { name: "PORT", value: String(port) }],
  resources: { limits: { cpu: "1", memory: "512Mi" }, cpuIdle: true, startupCpuBoost: true },
  startupProbe: { tcpSocket: { port }, initialDelaySeconds: 0, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 30 },
})

const frontend = (
  image: string,
  publicOrigin: string,
  backendNames: readonly string[],
  adminOrigin?: string,
): CloudRunContainer => ({
  name: "frontend",
  image,
  dependsOns: [...backendNames],
  ports: { containerPort: 8080 },
  envs: [
    { name: "PUBLIC_API_ORIGIN", value: publicOrigin },
    ...(adminOrigin === undefined ? [] : [{ name: "ADMIN_API_ORIGIN", value: adminOrigin }]),
  ],
  resources: { limits: { cpu: "1", memory: "256Mi" }, cpuIdle: true, startupCpuBoost: true },
  startupProbe: { tcpSocket: { port: 8080 }, initialDelaySeconds: 0, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 15 },
})

const publicPreview = deployServices ? createIapService("public", {
  project,
  projectNumber,
  location,
  serviceName: `${prefix}-public`,
  runtimeServiceAccount: runtime.account.email,
  iapPrincipal,
  containers: [
    frontend(webImage, "http://localhost:3000", ["public-api"]),
    backend("public-api", publicImage, 3000),
  ],
  labels,
  maxInstances: 1,
  dependsOn: [...identityDependencies, migration],
}) : undefined

const adminPreview = deployServices ? createIapService("admin", {
  project,
  projectNumber,
  location,
  serviceName: `${prefix}-admin`,
  runtimeServiceAccount: runtime.account.email,
  iapPrincipal,
  containers: [
    frontend(adminWebImage, "http://localhost:3000", ["public-api", "admin-api"], "http://localhost:3001"),
    backend("public-api", publicImage, 3000),
    backend("admin-api", adminImage, 3001),
  ],
  labels,
  maxInstances: 1,
  dependsOn: [...identityDependencies, migration],
}) : undefined

export const migrationJobName = migration.name
export const publicUrl = publicPreview?.service.uri
export const adminUrl = adminPreview?.service.uri
export const pullRequest = prNumber
