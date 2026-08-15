// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off
import type { JobProps } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { fakeResource } from "../test-resource.ts"
import { composePreviewDatabaseGrantPort } from "./preview-database-grants.ts"
import type { PreviewDatabaseGrantRequest } from "./preview-database.ts"

const digest = "a".repeat(64)
const request: PreviewDatabaseGrantRequest = {
  dependsOn: [fakeResource("runtime-user"), fakeResource("migration-user")],
  database: "proxus_pr_42", runtimeRole: "runtime@proxus-test.iam", migrationRole: "migrations@proxus-test.iam",
  runtime: { database: ["CONNECT"], schema: ["USAGE"], tables: ["SELECT", "INSERT", "UPDATE", "DELETE"], sequences: ["USAGE", "SELECT"] },
  migrations: { database: ["CONNECT", "CREATE", "TEMPORARY"], schema: ["USAGE", "CREATE"], ownsSchemaChanges: true },
}
const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

describe("PreviewDatabaseGrantJob", () => {
  test("declares a password-auth bootstrap job with only a Secret Manager reference", async () => {
    let declared: JobProps | undefined
    const port = composePreviewDatabaseGrantPort({
      project: "proxus-test", location: "europe-southwest1", prNumber: 42,
      image: `europe-southwest1-docker.pkg.dev/proxus-test/proxus/server@sha256:${digest}`,
      connectionName: "proxus-test:europe-southwest1:shared",
      serviceAccount: "bootstrap@proxus-test.iam.gserviceaccount.com",
      bootstrapUser: "proxus_preview_bootstrap",
      passwordSecretId: "preview-database-bootstrap-password",
      dependencies: [fakeResource("migration-identity")],
    }, { job: (_id, props) => Effect.sync(() => { declared = props; return { ...fakeResource("bootstrap"), project: props.project, location: props.location, name: props.name!, resourceName: `projects/${props.project}/locations/${props.location}/jobs/${props.name}` } }) })

    const output = await run(port.apply(request))
    expect(output.name).toBe("proxus-pr-42-database-bootstrap")
    expect(declared?.template.template?.serviceAccount).toBe("bootstrap@proxus-test.iam.gserviceaccount.com")
    expect(declared?.template.template?.containers?.[0]).toMatchObject({
      command: ["node"],
      args: ["/app/database-bootstrap.mjs"],
      env: expect.arrayContaining([
        { name: "DATABASE_ADAPTER", value: "cloud-sql-password" },
        { name: "DATABASE_MIGRATION_ROLE", value: "migrations@proxus-test.iam" },
        { name: "DATABASE_USER", value: "proxus_preview_bootstrap" },
      ]),
    })
    expect(declared?.template.template?.containers?.[0]?.env).toContainEqual({
      name: "DATABASE_PASSWORD",
      valueSource: { secretKeyRef: { secret: "preview-database-bootstrap-password", version: "latest" } },
    })
    expect(JSON.stringify(declared)).not.toContain("DATABASE_URL")
  })
})
