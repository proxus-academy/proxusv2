// @effect-diagnostics anyUnknownInErrorContext:off
import { isIapAccessPrincipal, type IapAccessPrincipal } from "../iap-access-principal.ts"
import type { Project } from "@microagi/alchemy-gcp"
import type { Output } from "alchemy/Output"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { adminBackendContainer, frontendProxyContainer, publicBackendContainer } from "./containers.ts"
import { IapProtectedService, type IapProtectedServiceOutputs } from "./iap-protected-service.ts"
import { MigrationJob, type MigrationJobOutputs, type MigrationSecretRef } from "./migration-job.ts"
import { RuntimeIdentity, type RuntimeIdentityOutputs } from "./runtime-identity.ts"
import { CloudRunService, type CloudRunServiceProps } from "../providers/cloud-run-service.ts"
import { ComputeBackendService, ServerlessNeg } from "../providers/compute.ts"

interface ProductionFoundationOutputs {
  readonly project: Project
  readonly projectId: string
  readonly projectNumber: string
  readonly location: string
  readonly productionDeployer: string
}
interface ProductionImages { readonly publicApi: string; readonly adminApi: string; readonly adminWeb: string }
interface ProductionSecrets {
  readonly database: MigrationSecretRef
  readonly authSigning: MigrationSecretRef
  readonly objectStorageSigning: MigrationSecretRef
  readonly mailgunApiKey: MigrationSecretRef
}
interface ProductionAnalytics { readonly project: string; readonly dataset: string; readonly table: string }
export interface ProductionRuntimeProps {
  readonly deployServices: boolean
  readonly foundation: ProductionFoundationOutputs
  readonly images: ProductionImages
  readonly secrets: ProductionSecrets
  readonly analytics: ProductionAnalytics
  readonly mailgun: { readonly domain: string; readonly from: string }
  readonly iapAccessPrincipal: IapAccessPrincipal
}
export interface ProductionRuntimeOutputs {
  readonly migrationJob: MigrationJobOutputs
  readonly publicApi: undefined | { readonly name: string | Output<string>; readonly url: string | Output<string> }
  readonly publicApiLoadBalancer: undefined | { readonly neg: string | Output<string>; readonly backendService: string | Output<string> }
  readonly admin: undefined | { readonly name: string | Output<string>; readonly url: string | Output<string> }
}
export class ProductionRuntimeConfigurationError extends Data.TaggedError("ProductionRuntimeConfigurationError")<{ readonly message: string }> {}

type PublicService = { readonly name: string | Output<string>; readonly resourceName: string | Output<string>; readonly uri: string | Output<string> }
interface Components {
  readonly identity: (props: Parameters<typeof RuntimeIdentity>[0]) => Effect.Effect<RuntimeIdentityOutputs, unknown, unknown>
  readonly migration: (props: Parameters<typeof MigrationJob>[0]) => Effect.Effect<MigrationJobOutputs, unknown, unknown>
  readonly publicService: (id: string, props: CloudRunServiceProps) => Effect.Effect<PublicService, unknown, unknown>
  readonly iapService: (props: Parameters<typeof IapProtectedService>[0]) => Effect.Effect<IapProtectedServiceOutputs, unknown, unknown>
  readonly neg: (id: string, props: { project: string; region: string; name: string; cloudRunService: string; deletionProtection: boolean }) => Effect.Effect<{ selfLink: string | Output<string> }, unknown, unknown>
  readonly backend: (id: string, props: { project: string; name: string; group: string; deletionProtection: boolean }) => Effect.Effect<{ selfLink: string | Output<string> }, unknown, unknown>
}
const real: Components = {
  identity: RuntimeIdentity, migration: MigrationJob,
  publicService: (id, props) => CloudRunService(id, props).pipe(Effect.map((service) => service as unknown as PublicService)), iapService: IapProtectedService,
  neg: (id, props) => ServerlessNeg(id, props), backend: (id, props) => ComputeBackendService(id, props),
}
const fail = (message: string): never => { throw new ProductionRuntimeConfigurationError({ message }) }
const validate = (p: ProductionRuntimeProps) => {
  if (p.secrets.database.name !== "DATABASE_URL") fail("database secret must populate DATABASE_URL")
  const expected = [[p.secrets.authSigning, "AUTH_GOOGLE_SIGNING_SECRET"], [p.secrets.objectStorageSigning, "OBJECT_STORAGE_SIGNING_SECRET"], [p.secrets.mailgunApiKey, "MAILGUN_API_KEY"]] as const
  for (const [secret, name] of expected) if (secret.name !== name) fail(`${name} secret has the wrong environment name`)
  if (!/^[0-9]+$/.test(p.foundation.projectNumber)) fail("projectNumber must be numeric")
  if (!isIapAccessPrincipal(p.iapAccessPrincipal)) fail("iapAccessPrincipal must be user:<email> or group:<email>")
}

/** Cloud-free composition seam. Jobs are declared, never executed. Website/CDN/edge resources are deliberately out of scope. */
export const composeProductionRuntime = (props: ProductionRuntimeProps, components: Components) => {
  validate(props)
  const f = props.foundation
  const labels = { system: "proxus-v2", environment: "production", managed_by: "alchemy" }
  const runtimeSecrets = [props.secrets.database, props.secrets.authSigning, props.secrets.objectStorageSigning, props.secrets.mailgunApiKey]
  const config = { NODE_ENV: "production", HOST: "0.0.0.0", DATABASE_MIGRATIONS_DIR: "/app/drizzle", MAILGUN_DOMAIN: props.mailgun.domain, MAILGUN_FROM: props.mailgun.from, AUTH_EMAIL_ADAPTER: "mailgun", AUTH_GOOGLE_ADAPTER: "real", PRODUCT_ANALYTICS_GCP_PROJECT: props.analytics.project, PRODUCT_ANALYTICS_BIGQUERY_DATASET: props.analytics.dataset, PRODUCT_ANALYTICS_BIGQUERY_TABLE: props.analytics.table }
  const identity = (kind: "public" | "admin" | "migrations", secretIds: readonly string[], analytics = false) => components.identity({ id: `ProductionRuntime-${kind}`, projectId: f.projectId, accountId: `proxus-production-${kind}`, displayName: `Proxus production ${kind} runtime`, deployer: f.productionDeployer, iamDatabaseAuthentication: false, secretIds, ...(analytics ? { bigQueryDataset: `projects/${props.analytics.project}/datasets/${props.analytics.dataset}` } : {}) })
  return Effect.gen(function* () {
    const [publicIdentity, adminIdentity, migrationIdentity] = yield* Effect.all([
      identity("public", runtimeSecrets.map((s) => s.secretId), true),
      identity("admin", runtimeSecrets.map((s) => s.secretId), true),
      identity("migrations", [props.secrets.database.secretId]),
    ])
    const migrationJob = yield* components.migration({ id: "ProductionRuntime-MigrationJob", project: f.projectId, location: f.location, name: "proxus-production-migrations", image: props.images.publicApi, runtimeServiceAccount: migrationIdentity.email, databaseBinding: { access: "ddl", kind: "database-url", secret: props.secrets.database, iam: Effect.void }, config: { DATABASE_MIGRATIONS_DIR: "/app/drizzle" }, labels, dependencies: migrationIdentity.dependencies })
    if (!props.deployServices) return { migrationJob, publicApi: undefined, publicApiLoadBalancer: undefined, admin: undefined } satisfies ProductionRuntimeOutputs
    const publicApi = yield* components.publicService("ProductionRuntime-PublicApi", { project: f.projectId, location: f.location, name: "proxus-production-public-api", labels, iapEnabled: false, deletionProtection: true, ingress: "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER", invokerIamDisabled: true, scaling: { maxInstanceCount: 10 }, dependsOn: [...publicIdentity.dependencies, migrationJob.resource], template: { serviceAccount: publicIdentity.email, timeout: "60s", maxInstanceRequestConcurrency: 80, containers: [publicBackendContainer({ project: f.projectId, location: f.location, image: props.images.publicApi, port: 8080, ingress: true, config, secretRefs: runtimeSecrets })] } })
    const neg = yield* components.neg("ProductionRuntime-PublicApiNeg", { project: f.projectId, region: f.location, name: "proxus-production-public-api", cloudRunService: publicApi.name as string, deletionProtection: true })
    const backend = yield* components.backend("ProductionRuntime-PublicApiBackend", { project: f.projectId, name: "proxus-production-public-api", group: neg.selfLink as string, deletionProtection: true })
    const admin = yield* components.iapService({ id: "ProductionRuntime-Admin", project: f.projectId, projectNumber: f.projectNumber, location: f.location, name: "proxus-production-admin", runtimeServiceAccount: adminIdentity.email, accessPrincipal: props.iapAccessPrincipal, maxInstances: 3, deletionPolicy: "retain", dependencies: [...adminIdentity.dependencies, migrationJob.resource], labels, containers: [frontendProxyContainer({ project: f.projectId, location: f.location, image: props.images.adminWeb, publicApiOrigin: "http://localhost:3000", adminApiOrigin: "http://localhost:3001" }), publicBackendContainer({ project: f.projectId, location: f.location, image: props.images.publicApi, port: 3000, config, secretRefs: runtimeSecrets }), adminBackendContainer({ project: f.projectId, location: f.location, image: props.images.adminApi, port: 3001, config, secretRefs: runtimeSecrets })] })
    return { migrationJob, publicApi: { name: publicApi.name, url: publicApi.uri }, publicApiLoadBalancer: { neg: neg.selfLink, backendService: backend.selfLink }, admin: { name: admin.name, url: admin.uri } } satisfies ProductionRuntimeOutputs
  })
}
export const ProductionRuntime = (props: ProductionRuntimeProps) => composeProductionRuntime(props, real)
