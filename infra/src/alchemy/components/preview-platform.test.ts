// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off
import type { ApiEnableAttributes, SqlInstanceAttributes, SqlInstanceProps } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { composePreviewPlatform, PreviewPlatformConfigurationError } from "./preview-platform.ts"

const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

const apiAttributes: ApiEnableAttributes = {
  project: "proxus-test",
  service: "sqladmin.googleapis.com",
  name: "projects/proxus-test/services/sqladmin.googleapis.com",
  state: "ENABLED",
}

const instanceAttributes = (props: SqlInstanceProps): SqlInstanceAttributes => ({
  name: props.name ?? "generated-name",
  selfLink: "instance-link",
  project: props.project,
  region: props.region,
  connectionName: `${props.project}:${props.region}:${props.name ?? "generated-name"}`,
  databaseVersion: props.databaseVersion,
  state: "RUNNABLE",
  ipAddresses: [],
  privateIpAddress: undefined,
  publicIpAddress: undefined,
  serverCaCert: undefined,
  settingsVersion: "1",
  labels: { ...props.labels },
})

describe("PreviewPlatform", () => {
  test("enables SQL Admin before creating a protected shared PostgreSQL instance", async () => {
    const calls: Array<{ readonly kind: string; readonly id: string; readonly props: unknown }> = []
    const output = await run(composePreviewPlatform(
      {
        project: "proxus-test",
        region: "europe-southwest1",
        instanceName: "proxus-preview-shared",
        labels: { owner: "platform" },
      },
      {
        api: (id, props) => Effect.sync(() => {
          calls.push({ kind: "api", id, props })
          return apiAttributes
        }),
        instance: (id, props) => Effect.sync(() => {
          calls.push({ kind: "instance", id, props })
          return instanceAttributes(props)
        }),
        secret: (id, props) => Effect.sync(() => { calls.push({ kind: "secret", id, props }); return { name: `projects/${props.project}/secrets/${props.secretId}`, project: props.project, secretId: props.secretId, labels: props.labels ?? {}, deletionProtection: true } }),
        dataset: (id, props) => Effect.sync(() => { calls.push({ kind: "dataset", id, props }); return { project: props.project, datasetId: props.datasetId, location: props.location, labels: props.labels ?? {} } }),
        table: (id, props) => Effect.sync(() => { calls.push({ kind: "table", id, props }); return { project: props.project, datasetId: props.datasetId, tableId: props.tableId, schema: props.schema, labels: props.labels ?? {} } }),
      },
    ))

    expect(calls[0]).toEqual({
      kind: "api",
      id: "PreviewPlatform-SqlAdminApi",
      props: { project: "proxus-test", service: "sqladmin.googleapis.com" },
    })
    expect(calls[1]).toEqual({
      kind: "instance",
      id: "PreviewPlatform-SharedPostgres",
      props: {
        project: "proxus-test",
        region: "europe-southwest1",
        name: "proxus-preview-shared",
        databaseVersion: "POSTGRES_17",
        labels: { environment: "shared-preview", managed_by: "alchemy", owner: "platform" },
        settings: {
          tier: "db-f1-micro",
          edition: "ENTERPRISE",
          dataDiskSizeGb: 10,
          dataDiskType: "PD_SSD",
          diskAutoresize: true,
          diskAutoresizeLimit: 50,
          ipConfiguration: { ipv4Enabled: true, requireSsl: true },
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
      },
    })
    expect(output).toEqual({
      instanceName: "proxus-preview-shared",
      connectionName: "proxus-test:europe-southwest1:proxus-preview-shared",
      project: "proxus-test",
      region: "europe-southwest1",
      authGoogleSigningSecretId: "preview-auth-google-signing",
      objectStorageSigningSecretId: "preview-object-storage-signing",
      mailgunApiKeySecretId: "preview-mailgun-api-key",
      databaseBootstrapPasswordSecretId: "preview-database-bootstrap-password",
      analyticsDatasetId: "preview_product_analytics",
      analyticsTableId: "events",
    })
    expect(calls.filter(({ kind }) => kind === "secret")).toHaveLength(4)
    expect(calls.find(({ id }) => id === "PreviewPlatform-DatabaseBootstrapPassword")?.props).toMatchObject({ secretId: "preview-database-bootstrap-password", deletionProtection: true })
    expect(calls.find(({ kind }) => kind === "dataset")?.props).toMatchObject({ datasetId: "preview_product_analytics", location: "europe-southwest1", deletionProtection: true })
    expect(calls.find(({ kind }) => kind === "table")?.props).toMatchObject({ datasetId: "preview_product_analytics", tableId: "events", deletionProtection: true })
  })

  test("fails before cloud composition for invalid names or labels", async () => {
    let called = false
    await expect(run(composePreviewPlatform(
      { project: "proxus-test", region: "europe-southwest1", instanceName: "Invalid_Name" },
      {
        api: () => Effect.sync(() => { called = true; return apiAttributes }),
        instance: () => Effect.die("must not compose"),
        secret: () => Effect.die("must not compose"),
        dataset: () => Effect.die("must not compose"),
        table: () => Effect.die("must not compose"),
      },
    ))).rejects.toBeInstanceOf(PreviewPlatformConfigurationError)
    expect(called).toBe(false)
  })
})
