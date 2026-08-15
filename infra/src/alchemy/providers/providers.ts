import * as GCP from "@microagi/alchemy-gcp"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { bigQueryIamLiveLayer, makeLiveBigQueryIamClient, type BigQueryLiveOptions } from "./bigquery-live.ts"
import { makeLiveBigQueryResourceClient } from "./bigquery-resources-live.ts"
import { bigQueryResourceProviders } from "./bigquery-resources.ts"
import { BigQueryDatasetIamMemberProvider } from "./bigquery.ts"
import { cloudRunServiceLiveLayer, type CloudRunLiveOptions } from "./cloud-run-service-live.ts"
import { cdnLiveLayer, type CdnLiveOptions } from "./cdn-live.ts"
import { cloudKmsProviderLayers, type CloudKmsLiveOptions } from "./cloud-kms-live.ts"
import { computeLiveLayer, type ComputeLiveOptions } from "./compute-live.ts"
import { edgeLiveLayer, type EdgeLiveOptions } from "./edge-live.ts"
import {
  cloudRunIapInvokerLiveLayer,
  iapCloudRunAccessLiveLayer,
  iapLiveLayer,
  makeLiveIapClient,
  type IapLiveOptions,
} from "./iap-live.ts"
import { makeLiveProjectIamClient, type ProjectIamLiveOptions } from "./project-iam-member-live.ts"
import { ProjectIamMemberProvider } from "./project-iam-member.ts"
import { secretManagerLiveLayer, makeLiveSecretManagerClient, type SecretManagerLiveOptions } from "./secret-manager-live.ts"
import { SecretIamMemberProvider, SecretProvider } from "./secret-manager.ts"
import { storageObjectLiveLayer, type StorageObjectLiveOptions } from "./storage-object-live.ts"

export interface ProxusProvidersOptions {
  readonly project: string
  readonly location: string
  readonly secretManager?: Pick<SecretManagerLiveOptions, "operations">
  readonly projectIam?: Pick<ProjectIamLiveOptions, "operations">
  readonly bigQuery?: Pick<BigQueryLiveOptions, "operations">
  readonly iap?: Pick<IapLiveOptions, "operations">
  readonly cloudRun?: Pick<CloudRunLiveOptions, "operations" | "maxOperationPolls" | "maxListPages">
  readonly cloudKms?: Pick<CloudKmsLiveOptions, "operations">
  readonly cdn?: Pick<CdnLiveOptions, "operations" | "maxOperationPolls">
  readonly compute?: Pick<ComputeLiveOptions, "operations" | "maxOperationPolls">
  readonly edge?: Pick<EdgeLiveOptions, "operations" | "maxOperationPolls">
  readonly storageObject?: Pick<StorageObjectLiveOptions, "projectNumber" | "buckets" | "request" | "readSource" | "accessToken">
}

/** Central provider bundle for Proxus Alchemy stacks. Layer construction is lazy. */
export const proxusProviders = (options: ProxusProvidersOptions) => {
  const secretOptions: SecretManagerLiveOptions = { project: options.project, ...options.secretManager }
  const bigQueryOptions: BigQueryLiveOptions = { project: options.project, ...options.bigQuery }
  const iapOptions: IapLiveOptions = { project: options.project, location: options.location, ...options.iap }
  const secretClient = makeLiveSecretManagerClient(secretOptions)
  const bigQueryClient = makeLiveBigQueryIamClient(bigQueryOptions)
  const iapClient = makeLiveIapClient(iapOptions)
  const projectIamClient = makeLiveProjectIamClient(options.projectIam)

  const gcp = GCP.providers().pipe(
    Layer.provideMerge(FetchHttpClient.layer),
    Layer.provideMerge(GCP.fromADC(options.project)),
  )

  return Layer.mergeAll(
    gcp,
    secretManagerLiveLayer(secretOptions),
    bigQueryIamLiveLayer(bigQueryOptions),
    iapLiveLayer(iapOptions),
    SecretProvider(secretClient),
    SecretIamMemberProvider(secretClient),
    ProjectIamMemberProvider(projectIamClient),
    BigQueryDatasetIamMemberProvider(bigQueryClient),
    bigQueryResourceProviders(makeLiveBigQueryResourceClient()),
    cloudRunIapInvokerLiveLayer(iapOptions),
    iapCloudRunAccessLiveLayer(iapOptions),
    cloudRunServiceLiveLayer({ project: options.project, location: options.location, ...options.cloudRun }),
    cloudKmsProviderLayers({ project: options.project, ...options.cloudKms }),
    cdnLiveLayer({ project: options.project, ...options.cdn }),
    computeLiveLayer({ project: options.project, ...options.compute }),
    edgeLiveLayer({ project: options.project, ...options.edge }),
    storageObjectLiveLayer({ project: options.project, ...options.storageObject }),
  )
}
