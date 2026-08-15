// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off
import type { SqlDatabaseAttributes, SqlUserAttributes } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { fakeResource } from "../test-resource.ts"
import { composePreviewDatabase, PreviewDatabaseConfigurationError, type PreviewDatabaseGrantRequest, type PreviewDatabaseProps } from "./preview-database.ts"

const bootstrapJob = { resource: fakeResource("bootstrap"), project: "shared-project", location: "europe-southwest1", name: "bootstrap", resourceName: "bootstrap-resource" }
const props = (apply: (request: PreviewDatabaseGrantRequest) => Effect.Effect<typeof bootstrapJob>): PreviewDatabaseProps => ({
  instance: { project: "shared-project", name: "shared-postgres", connectionName: "shared-project:europe-southwest1:shared-postgres" },
  prNumber: 42,
  runtimePrincipal: { email: "preview-42-runtime@shared-project.iam.gserviceaccount.com" },
  migrationPrincipal: { email: "preview-42-migrations@shared-project.iam.gserviceaccount.com" },
  grants: { apply },
  dependencies: [fakeResource("runtime-identity"), fakeResource("migration-identity")],
})

const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

describe("PreviewDatabase", () => {
  test("composes only a database, two IAM users, and explicit separated grants", async () => {
    const databases: Array<[string, unknown]> = []
    const users: Array<[string, unknown]> = []
    const grants: PreviewDatabaseGrantRequest[] = []

    const output = await run(composePreviewDatabase(
      props((request) => Effect.sync(() => { grants.push(request); return bootstrapJob })),
      {
        database: (id, input) => Effect.sync(() => {
          databases.push([id, input])
          return { ...input, selfLink: "database-link", charset: "UTF8", collation: "en_US.UTF8" } satisfies SqlDatabaseAttributes
        }),
        user: (id, input) => Effect.sync(() => {
          users.push([id, input])
          return { ...fakeResource(id), ...input, host: "%" } satisfies SqlUserAttributes & ReturnType<typeof fakeResource>
        }),
      },
    ))

    expect(databases).toEqual([["PreviewDatabase-pr-42-Database", { project: "shared-project", instance: "shared-postgres", name: "proxus_pr_42" }]])
    expect(users).toEqual([
      ["PreviewDatabase-pr-42-RuntimeUser", expect.objectContaining({ project: "shared-project", instance: "shared-postgres", name: "preview-42-runtime@shared-project.iam", type: "CLOUD_IAM_SERVICE_ACCOUNT" })],
      ["PreviewDatabase-pr-42-MigrationUser", expect.objectContaining({ project: "shared-project", instance: "shared-postgres", name: "preview-42-migrations@shared-project.iam", type: "CLOUD_IAM_SERVICE_ACCOUNT" })],
    ])
    expect(grants).toEqual([expect.objectContaining({
      database: "proxus_pr_42",
      runtime: { database: ["CONNECT"], schema: ["USAGE"], tables: ["SELECT", "INSERT", "UPDATE", "DELETE"], sequences: ["USAGE", "SELECT"] },
      migrations: { database: ["CONNECT", "CREATE", "TEMPORARY"], schema: ["USAGE", "CREATE"], ownsSchemaChanges: true },
    })])
    expect(output).toMatchObject({
      databaseName: "proxus_pr_42",
      instanceName: "shared-postgres",
      connectionName: "shared-project:europe-southwest1:shared-postgres",
      runtimeDatabaseRole: "preview-42-runtime@shared-project.iam",
      migrationDatabaseRole: "preview-42-migrations@shared-project.iam",
      bootstrapJob,
    })
    expect(JSON.stringify(output)).not.toMatch(/password|secret/i)
  })

  test("fails closed instead of collapsing runtime and migration identities", async () => {
    const input = props(() => Effect.succeed(bootstrapJob))
    await expect(run(composePreviewDatabase(
      { ...input, migrationPrincipal: input.runtimePrincipal },
      { database: () => Effect.die("must not compose"), user: () => Effect.die("must not compose") },
    ))).rejects.toBeInstanceOf(PreviewDatabaseConfigurationError)
  })

  test("rejects a principal that is not a service-account IAM user", async () => {
    const input = props(() => Effect.succeed(bootstrapJob))
    await expect(run(composePreviewDatabase(
      { ...input, runtimePrincipal: { email: "human@example.com" } },
      { database: () => Effect.die("must not compose"), user: () => Effect.die("must not compose") },
    ))).rejects.toThrow("must be a service-account email")
  })
})
