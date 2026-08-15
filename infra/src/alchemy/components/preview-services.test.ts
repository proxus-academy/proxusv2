// @effect-diagnostics asyncFunction:off unsafeEffectTypeAssertion:off anyUnknownInErrorContext:off
import * as Effect from "effect/Effect"
import { fakeResource } from "../test-resource.ts"
import { describe, expect, test } from "vitest"
import { composePreviewServices, PREVIEW_OBJECT_STORAGE_LOCAL_ROOT, previewRuntimeEnvironment, PreviewServicesConfigurationError, type PreviewServicesProps } from "./preview-services.ts"

const digest = "a".repeat(64)
const project = "proxus-test"
const location = "europe-southwest1"
const image = (name: string) => `${location}-docker.pkg.dev/${project}/proxus/${name}@sha256:${digest}`
const props: PreviewServicesProps = {
  project,
  projectNumber: "123456789",
  location,
  prNumber: 42,
  accessPrincipal: "group:preview@example.test",
  runtimeIdentity: { email: "preview@proxus-test.iam.gserviceaccount.com", name: "runtime", dependencies: [fakeResource("runtime-identity")] },
  databaseBinding: { access: "runtime", kind: "cloud-sql-iam", connectionName: "proxus-test:europe-southwest1:preview", database: "proxus_pr_42", user: "preview@proxus-test.iam", iam: Effect.void },
  secretRefs: [{ name: "AUTH_GOOGLE_SIGNING_SECRET", secretId: "auth-signing" }],
  analytics: { project, dataset: "product_analytics", table: "events" },
  mailgun: { domain: "mail.example.test", from: "Proxus <noreply@example.test>" },
  images: { publicApi: image("server"), adminApi: image("admin-server"), web: image("web"), adminWeb: image("admin-web") },
  migration: fakeResource("migration"),
  dependencies: [fakeResource("runtime-user")],
}
const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

describe("PreviewServices", () => {
  test("uses an explicit writable ephemeral object-storage root", () => {
    expect(previewRuntimeEnvironment(props)).toMatchObject({
      OBJECT_STORAGE_LOCAL_ROOT: PREVIEW_OBJECT_STORAGE_LOCAL_ROOT,
    })
    expect(PREVIEW_OBJECT_STORAGE_LOCAL_ROOT).toBe("/tmp/proxus-object-storage")
    expect(PREVIEW_OBJECT_STORAGE_LOCAL_ROOT.startsWith("/app/")).toBe(false)
  })

  test("composes exactly the public and admin IAP services", async () => {
    const calls: Array<any> = []
    const output = await run(composePreviewServices(props, {
      service: (serviceProps) => Effect.sync(() => {
        calls.push(serviceProps)
        return {
          project: serviceProps.project,
          location: serviceProps.location,
          name: serviceProps.name,
          resourceName: `projects/${project}/locations/${location}/services/${serviceProps.name}`,
          uri: `https://${serviceProps.name}.run.app`,
        }
      }),
    }))

    expect(calls).toHaveLength(2)
    expect(calls.map(({ id, name, maxInstances, labels }: any) => ({ id, name, maxInstances, labels }))).toEqual([
      { id: "PreviewServices-pr-42-Public", name: "proxus-pr-42-public", maxInstances: 1, labels: { system: "proxus-v2", environment: "preview", pr: "42", managed_by: "alchemy" } },
      { id: "PreviewServices-pr-42-Admin", name: "proxus-pr-42-admin", maxInstances: 1, labels: { system: "proxus-v2", environment: "preview", pr: "42", managed_by: "alchemy" } },
    ])
    expect(calls[0].runtimeServiceAccount).toBe(props.runtimeIdentity.email)
    expect(calls[0].dependencies).toEqual([...props.runtimeIdentity.dependencies, ...props.dependencies, props.migration])
    expect(calls[0].containers.map((container: any) => container.name)).toEqual(["frontend", "public-api"])
    expect(calls[1].containers.map((container: any) => container.name)).toEqual(["frontend", "public-api", "admin-api"])
    expect(calls[1].containers[0]).toMatchObject({ dependsOn: ["public-api", "admin-api"] })
    expect(calls[0].containers[1].env).toEqual(expect.arrayContaining([
      { name: "DATABASE_ADAPTER", value: "cloud-sql-iam" },
      { name: "DATABASE_NAME", value: "proxus_pr_42" },
      { name: "AUTH_GOOGLE_SIGNING_SECRET", valueSource: { secretKeyRef: { secret: "auth-signing", version: "latest" } } },
      { name: "PRODUCT_ANALYTICS_BIGQUERY_DATASET", value: "product_analytics" },
      { name: "MAILGUN_DOMAIN", value: "mail.example.test" },
      { name: "MAILGUN_FROM", value: "Proxus <noreply@example.test>" },
      { name: "AUTH_EMAIL_ADAPTER", value: "mailgun" },
      { name: "OBJECT_STORAGE_LOCAL_ROOT", value: "/tmp/proxus-object-storage" },
    ]))
    expect(calls[1].containers[1].env).toEqual(expect.arrayContaining([
      { name: "OBJECT_STORAGE_LOCAL_ROOT", value: "/tmp/proxus-object-storage" },
    ]))
    expect(output).toEqual({
      publicName: "proxus-pr-42-public",
      publicUrl: "https://proxus-pr-42-public.run.app",
      adminName: "proxus-pr-42-admin",
      adminUrl: "https://proxus-pr-42-admin.run.app",
    })
  })

  test("rejects an invalid PR before composing resources", () => {
    expect(() => composePreviewServices({ ...props, prNumber: 0 }, { service: () => Effect.die("unused") })).toThrow(PreviewServicesConfigurationError)
  })
})
