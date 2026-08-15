// @effect-diagnostics anyUnknownInErrorContext:off
import {
  ApiEnable,
  SqlInstance,
  type ApiEnableAttributes,
  type ApiEnableProps,
  type SqlInstanceAttributes,
  type SqlInstanceProps,
} from "@microagi/alchemy-gcp"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { BigQueryDataset, BigQueryTable, type BigQueryDatasetAttributes, type BigQueryField, type BigQueryTableAttributes } from "../providers/bigquery-resources.ts"
import { Secret, type SecretAttributes } from "../providers/secret-manager.ts"

export interface PreviewPlatformProps {
  readonly project: string
  readonly region: string
  readonly instanceName?: string
  readonly labels?: Readonly<Record<string, string>>
}

export interface PreviewPlatformOutputs {
  readonly instanceName: string
  readonly connectionName: string
  readonly project: string
  readonly region: string
  readonly authGoogleSigningSecretId: string
  readonly objectStorageSigningSecretId: string
  readonly mailgunApiKeySecretId: string
  readonly databaseBootstrapPasswordSecretId: string
  readonly analyticsDatasetId: string
  readonly analyticsTableId: string
}

export class PreviewPlatformConfigurationError extends Data.TaggedError("PreviewPlatformConfigurationError")<{
  readonly message: string
}> {}

interface PreviewPlatformResources {
  readonly api: (id: string, props: ApiEnableProps) => Effect.Effect<ApiEnableAttributes, unknown, unknown>
  readonly instance: (id: string, props: SqlInstanceProps) => Effect.Effect<SqlInstanceAttributes, unknown, unknown>
  readonly secret: (id: string, props: { readonly project: string; readonly secretId: string; readonly labels?: Readonly<Record<string, string>>; readonly deletionProtection: true }) => Effect.Effect<SecretAttributes, unknown, unknown>
  readonly dataset: (id: string, props: { readonly project: string; readonly datasetId: string; readonly location: string; readonly labels?: Readonly<Record<string, string>>; readonly deletionProtection: true }) => Effect.Effect<BigQueryDatasetAttributes, unknown, unknown>
  readonly table: (id: string, props: { readonly project: string; readonly datasetId: string; readonly tableId: string; readonly schema: ReadonlyArray<BigQueryField>; readonly labels?: Readonly<Record<string, string>>; readonly deletionProtection: true }) => Effect.Effect<BigQueryTableAttributes, unknown, unknown>
}

const realResources: PreviewPlatformResources = {
  api: ApiEnable,
  instance: SqlInstance,
  secret: Secret,
  dataset: (id, props) => BigQueryDataset(id, props) as unknown as Effect.Effect<BigQueryDatasetAttributes, unknown, unknown>,
  table: (id, props) => BigQueryTable(id, props) as unknown as Effect.Effect<BigQueryTableAttributes, unknown, unknown>,
}

const identifier = /^[a-z][a-z0-9-]{0,97}$/
const labelKey = /^[a-z][a-z0-9_-]{0,62}$/
const labelValue = /^[a-z0-9_-]{0,63}$/

const validate = (props: PreviewPlatformProps): void => {
  if (props.project.length === 0) throw new PreviewPlatformConfigurationError({ message: "project is required" })
  if (props.region.length === 0) throw new PreviewPlatformConfigurationError({ message: "region is required" })
  if (props.instanceName !== undefined && !identifier.test(props.instanceName)) {
    throw new PreviewPlatformConfigurationError({ message: "instanceName must be a valid Cloud SQL instance name" })
  }
  for (const [key, value] of Object.entries(props.labels ?? {})) {
    if (!labelKey.test(key) || !labelValue.test(value)) {
      throw new PreviewPlatformConfigurationError({ message: `Invalid GCP label: ${key}=${value}` })
    }
  }
}

/** Internal resource seam for cloud-free synthesis tests. */
export const composePreviewPlatform = (props: PreviewPlatformProps, resources: PreviewPlatformResources) =>
  Effect.gen(function* () {
    validate(props)

    const sqlAdmin = yield* resources.api("PreviewPlatform-SqlAdminApi", {
      project: props.project,
      service: "sqladmin.googleapis.com",
    })

    // The provider has a real Cloud SQL deletion-protection field. Keep this
    // compile-time checked: do not silently substitute an invented lifecycle prop.
    const instanceProps = {
      project: sqlAdmin.project,
      region: props.region,
      ...(props.instanceName === undefined ? {} : { name: props.instanceName }),
      databaseVersion: "POSTGRES_17",
      labels: {
        environment: "shared-preview",
        managed_by: "alchemy",
        ...props.labels,
      },
      settings: {
        tier: "db-f1-micro",
        edition: "ENTERPRISE",
        dataDiskSizeGb: 10,
        dataDiskType: "PD_SSD",
        diskAutoresize: true,
        diskAutoresizeLimit: 50,
        ipConfiguration: {
          ipv4Enabled: true,
          requireSsl: true,
        },
        backupConfiguration: {
          enabled: true,
          pointInTimeRecoveryEnabled: true,
          startTime: "02:00",
          transactionLogRetentionDays: 7,
        },
        databaseFlags: [{ name: "cloudsql.iam_authentication", value: "on" }],
        deletionProtectionEnabled: true,
        activationPolicy: "ALWAYS",
        availabilityType: "ZONAL",
      },
    } satisfies SqlInstanceProps

    const instance = yield* resources.instance("PreviewPlatform-SharedPostgres", instanceProps)
    const labels = { environment: "shared-preview", managed_by: "alchemy" }
    const [authSecret, objectSecret, mailgunSecret, bootstrapPasswordSecret] = yield* Effect.all([
      resources.secret("PreviewPlatform-AuthGoogleSigning", { project: props.project, secretId: "preview-auth-google-signing", labels, deletionProtection: true }),
      resources.secret("PreviewPlatform-ObjectStorageSigning", { project: props.project, secretId: "preview-object-storage-signing", labels, deletionProtection: true }),
      resources.secret("PreviewPlatform-MailgunApiKey", { project: props.project, secretId: "preview-mailgun-api-key", labels, deletionProtection: true }),
      resources.secret("PreviewPlatform-DatabaseBootstrapPassword", { project: props.project, secretId: "preview-database-bootstrap-password", labels, deletionProtection: true }),
    ])
    const analyticsSchema: ReadonlyArray<BigQueryField> = [
      { name: "eventId", type: "STRING", mode: "REQUIRED" }, { name: "receivedAt", type: "TIMESTAMP", mode: "REQUIRED" },
      { name: "occurredAt", type: "TIMESTAMP", mode: "NULLABLE" }, { name: "subjectId", type: "STRING", mode: "REQUIRED" },
      { name: "sessionId", type: "STRING", mode: "NULLABLE" }, { name: "flagKey", type: "STRING", mode: "REQUIRED" },
      { name: "variant", type: "STRING", mode: "REQUIRED" }, { name: "revision", type: "INTEGER", mode: "REQUIRED" },
      { name: "event", type: "RECORD", mode: "REQUIRED", fields: [
        { name: "_tag", type: "STRING", mode: "REQUIRED" }, { name: "occurredAt", type: "TIMESTAMP", mode: "NULLABLE" },
        { name: "flagKey", type: "STRING", mode: "REQUIRED" }, { name: "variant", type: "STRING", mode: "REQUIRED" },
        { name: "revision", type: "INTEGER", mode: "REQUIRED" }, { name: "step", type: "STRING", mode: "NULLABLE" },
        { name: "stepIndex", type: "INTEGER", mode: "NULLABLE" }, { name: "totalSteps", type: "INTEGER", mode: "NULLABLE" },
        { name: "provider", type: "STRING", mode: "NULLABLE" },
      ] },
    ]
    const dataset: BigQueryDatasetAttributes = yield* resources.dataset("PreviewPlatform-AnalyticsDataset", { project: props.project, datasetId: "preview_product_analytics", location: props.region, labels, deletionProtection: true })
    const table: BigQueryTableAttributes = yield* resources.table("PreviewPlatform-AnalyticsEventsTable", { project: dataset.project, datasetId: dataset.datasetId, tableId: "events", schema: analyticsSchema, labels, deletionProtection: true })

    return {
      instanceName: instance.name,
      connectionName: instance.connectionName,
      project: instance.project,
      region: instance.region,
      authGoogleSigningSecretId: authSecret.secretId,
      objectStorageSigningSecretId: objectSecret.secretId,
      mailgunApiKeySecretId: mailgunSecret.secretId,
      databaseBootstrapPasswordSecretId: bootstrapPasswordSecret.secretId,
      analyticsDatasetId: dataset.datasetId,
      analyticsTableId: table.tableId,
    } satisfies PreviewPlatformOutputs
  })

/** Shared Cloud SQL platform for ephemeral preview databases. No admin identity is needed at instance creation. */
export const PreviewPlatform = (props: PreviewPlatformProps) => composePreviewPlatform(props, realResources)
