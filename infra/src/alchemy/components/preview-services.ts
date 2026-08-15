// @effect-diagnostics anyUnknownInErrorContext:off
import type { IapAccessPrincipal } from "../iap-access-principal.ts"
import type { Output } from "alchemy/Output"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { adminBackendContainer, frontendProxyContainer, publicBackendContainer } from "./containers.ts"
import { IapProtectedService, type IapProtectedServiceOutputs, type IapProtectedServiceProps } from "./iap-protected-service.ts"
import type { MigrationSecretRef } from "./migration-job.ts"
import { databaseBindingEnvironment, type DatabaseBinding } from "./database-binding.ts"
import type { RuntimeIdentityOutputs } from "./runtime-identity.ts"
import type { ResourceDependency } from "../resource-dependency.ts"

export interface PreviewAnalyticsConfig {
  readonly project: string
  readonly dataset: string
  readonly table: string
}

export interface PreviewServiceImages {
  readonly publicApi: string
  readonly adminApi: string
  readonly web: string
  readonly adminWeb: string
}

export interface PreviewServicesProps {
  readonly project: string
  readonly projectNumber: string
  readonly location: string
  readonly prNumber: number
  readonly accessPrincipal: IapAccessPrincipal
  readonly runtimeIdentity: RuntimeIdentityOutputs
  readonly databaseBinding: DatabaseBinding & { readonly access: "runtime" }
  readonly secretRefs: ReadonlyArray<MigrationSecretRef>
  readonly analytics: PreviewAnalyticsConfig
  readonly mailgun: { readonly domain: string; readonly from: string }
  readonly images: PreviewServiceImages
  /** The already-declared migration job (or a dependency representing it). */
  readonly migration: ResourceDependency
  readonly dependencies: ReadonlyArray<ResourceDependency>
}

export interface PreviewServicesOutputs {
  readonly publicName: string | Output<string>
  readonly publicUrl: string | Output<string>
  readonly adminName: string | Output<string>
  readonly adminUrl: string | Output<string>
}

export class PreviewServicesConfigurationError extends Data.TaggedError("PreviewServicesConfigurationError")<{
  readonly message: string
}> {}

interface PreviewServicesResources {
  readonly service: (props: IapProtectedServiceProps) => Effect.Effect<IapProtectedServiceOutputs, unknown, unknown>
}

const realResources: PreviewServicesResources = { service: IapProtectedService }

export const PREVIEW_OBJECT_STORAGE_LOCAL_ROOT = "/tmp/proxus-object-storage"

/** Runtime-only preview configuration. Cloud Run's /tmp is writable but ephemeral. */
export const previewRuntimeEnvironment = (props: Pick<PreviewServicesProps, "databaseBinding" | "analytics" | "mailgun">) => ({
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  DATABASE_MIGRATIONS_DIR: "/app/drizzle",
  MAILGUN_DOMAIN: props.mailgun.domain,
  MAILGUN_FROM: props.mailgun.from,
  AUTH_EMAIL_ADAPTER: "mailgun",
  OBJECT_STORAGE_LOCAL_ROOT: PREVIEW_OBJECT_STORAGE_LOCAL_ROOT,
  ...databaseBindingEnvironment(props.databaseBinding),
  PRODUCT_ANALYTICS_GCP_PROJECT: props.analytics.project,
  PRODUCT_ANALYTICS_BIGQUERY_DATASET: props.analytics.dataset,
  PRODUCT_ANALYTICS_BIGQUERY_TABLE: props.analytics.table,
})

const validate = (props: PreviewServicesProps): void => {
  if (!Number.isSafeInteger(props.prNumber) || props.prNumber <= 0) {
    throw new PreviewServicesConfigurationError({ message: "prNumber must be a positive safe integer" })
  }
  if (props.databaseBinding.access !== "runtime") {
    throw new PreviewServicesConfigurationError({ message: "databaseBinding must be a runtime/DML binding" })
  }
}

/** Internal seam for cloud-free composition tests. Creates services only. */
export const composePreviewServices = (props: PreviewServicesProps, resources: PreviewServicesResources) => {
  validate(props)
  const prefix = `proxus-pr-${props.prNumber}`
  const labels = { system: "proxus-v2", environment: "preview", pr: String(props.prNumber), managed_by: "alchemy" }
  const config = previewRuntimeEnvironment(props)
  const secrets = props.secretRefs
  const backend = (image: string, port: number, admin = false) => (admin ? adminBackendContainer : publicBackendContainer)({
    project: props.project, location: props.location, image, port, config, secretRefs: secrets,
  })
  const common = {
    project: props.project,
    projectNumber: props.projectNumber,
    location: props.location,
    runtimeServiceAccount: props.runtimeIdentity.email,
    labels,
    maxInstances: 1,
    dependencies: [...props.runtimeIdentity.dependencies, ...props.dependencies, props.migration],
    accessPrincipal: props.accessPrincipal,
    deletionPolicy: "delete" as const,
  }

  return Effect.gen(function* () {
    const publicService = yield* resources.service({
      ...common,
      id: `PreviewServices-pr-${props.prNumber}-Public`,
      name: `${prefix}-public`,
      containers: [
        frontendProxyContainer({ project: props.project, location: props.location, image: props.images.web, publicApiOrigin: "http://localhost:3000" }),
        backend(props.images.publicApi, 3000),
      ],
    })
    const adminService = yield* resources.service({
      ...common,
      id: `PreviewServices-pr-${props.prNumber}-Admin`,
      name: `${prefix}-admin`,
      containers: [
        frontendProxyContainer({ project: props.project, location: props.location, image: props.images.adminWeb, publicApiOrigin: "http://localhost:3000", adminApiOrigin: "http://localhost:3001" }),
        backend(props.images.publicApi, 3000),
        backend(props.images.adminApi, 3001, true),
      ],
    })
    return { publicName: publicService.name, publicUrl: publicService.uri, adminName: adminService.name, adminUrl: adminService.uri } satisfies PreviewServicesOutputs
  })
}

export const PreviewServices = (props: PreviewServicesProps) => composePreviewServices(props, realResources)
