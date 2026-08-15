// @effect-diagnostics asyncFunction:off unsafeEffectTypeAssertion:off anyUnknownInErrorContext:off
import type { Project } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { fakeResource } from "../test-resource.ts"
import { composePreviewEnvironment, type PreviewEnvironmentProps } from "./preview-environment.ts"

const project = {} as Project
const digest = "a".repeat(64)
const image = (name: string) => `europe-southwest1-docker.pkg.dev/proxus-test/proxus/${name}@sha256:${digest}`
const props: PreviewEnvironmentProps = {
  prNumber: 42,
  deployServices: true,
  foundation: { project, projectId: "proxus-test", projectNumber: "123", location: "europe-southwest1", previewDeployer: "serviceAccount:deployer@proxus-test.iam.gserviceaccount.com" },
  cloudSql: { project: "proxus-test", name: "shared", connectionName: "proxus-test:europe-southwest1:shared" },
  images: { publicApi: image("server"), adminApi: image("admin-server"), web: image("web"), adminWeb: image("admin-web") },
  secrets: { runtime: [{ name: "SIGNING_SECRET", secretId: "signing" }], bootstrapPasswordSecretId: "preview-database-bootstrap-password" },
  analytics: { project: "proxus-test", dataset: "analytics", table: "events" },
  mailgun: { domain: "mail.example.test", from: "Proxus <noreply@example.test>" },
  iapAccessPrincipal: "group:preview@example.test",
}
const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

const fixture = () => {
  const calls: Array<{ kind: string; props: any }> = []
  let identity = 0
  const components = {
    identity: (input: any) => Effect.sync(() => { calls.push({ kind: "identity", props: input }); identity++; return { email: `${identity === 1 ? "runtime" : identity === 2 ? "migrations" : "bootstrap"}@proxus-test.iam.gserviceaccount.com`, name: `identity-${identity}`, dependencies: [fakeResource(`identity:${identity}`)] } }),
    database: (input: any) => Effect.sync(() => { calls.push({ kind: "database", props: input }); return { databaseName: "proxus_pr_42", instanceName: "shared", connectionName: props.cloudSql.connectionName, runtimeDatabaseRole: "runtime", migrationDatabaseRole: "migrations", runtimeUser: fakeResource("runtime-user"), migrationUser: fakeResource("migration-user"), bootstrapJob: { resource: fakeResource("bootstrap"), project: "proxus-test", location: "europe-southwest1", name: "bootstrap", resourceName: "bootstrap-resource" } } }),
    migrationJob: (input: any) => Effect.sync(() => { calls.push({ kind: "migration", props: input }); return { resource: fakeResource("migration"), project: "proxus-test", location: "europe-southwest1", name: "proxus-pr-42-migrations", resourceName: "migration-resource" } }),
    services: (input: any) => Effect.sync(() => { calls.push({ kind: "services", props: input }); return { publicName: "proxus-pr-42-public", publicUrl: "https://public", adminName: "proxus-pr-42-admin", adminUrl: "https://admin" } }),
    databaseGrantPort: (input: any) => { calls.push({ kind: "grant-port", props: input }); return { apply: () => Effect.succeed({ resource: fakeResource("bootstrap"), project: "proxus-test", location: "europe-southwest1", name: "bootstrap", resourceName: "bootstrap-resource" }) } },
  }
  return { calls, components }
}

describe("PreviewEnvironment", () => {
  test("composes separate identities, explicit database grants, migration, and pr-N services", async () => {
    const f = fixture()
    const output = await run(composePreviewEnvironment(props, f.components))
    expect(f.calls.map(({ kind }) => kind)).toEqual(["identity", "identity", "identity", "grant-port", "database", "migration", "services"])
    expect(f.calls[0]!.props.accountId).toBe("proxus-pr-42-runtime")
    expect(f.calls[1]!.props.accountId).toBe("proxus-pr-42-migrations")
    expect(f.calls[2]!.props).toMatchObject({ accountId: "proxus-pr-42-bootstrap", iamDatabaseAuthentication: false, secretIds: ["preview-database-bootstrap-password"] })
    expect(f.calls[0]!.props.secretIds).toEqual(["signing"])
    expect(f.calls[1]!.props.secretIds).toEqual([])
    expect(f.calls[3]!.props).toMatchObject({ serviceAccount: "bootstrap@proxus-test.iam.gserviceaccount.com", bootstrapUser: "proxus_preview_bootstrap", passwordSecretId: "preview-database-bootstrap-password" })
    expect(f.calls[4]!.props.grants).toBeDefined()
    expect(f.calls[5]!.props).toMatchObject({ name: "proxus-pr-42-migrations", labels: { environment: "preview", pr: "42" }, databaseBinding: { kind: "cloud-sql-iam", database: "proxus_pr_42", user: "migrations" }, config: { DATABASE_MIGRATIONS_DIR: "/app/drizzle", DATABASE_RUNTIME_ROLE: "runtime" } })
    expect(f.calls[6]!.props).toMatchObject({ prNumber: 42, mailgun: props.mailgun, databaseBinding: { kind: "cloud-sql-iam", database: "proxus_pr_42", user: "runtime" } })
    expect(output).toMatchObject({ migrationJob: { name: "proxus-pr-42-migrations" }, database: { databaseName: "proxus_pr_42" }, public: { publicUrl: "https://public" }, admin: { adminUrl: "https://admin" } })
  })

  test("deployServices=false stops after declaring the migration job", async () => {
    const f = fixture()
    const output = await run(composePreviewEnvironment({ ...props, deployServices: false }, f.components))
    expect(f.calls.map(({ kind }) => kind)).toEqual(["identity", "identity", "identity", "grant-port", "database", "migration"])
    expect(output.public).toBeUndefined()
    expect(output.admin).toBeUndefined()
  })
})
