// @effect-diagnostics asyncFunction:off unsafeEffectTypeAssertion:off anyUnknownInErrorContext:off
import type { JobProps } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { fakeResource } from "../test-resource.ts"
import { composeMigrationJob, MigrationJobConfigurationError, type MigrationJobProps } from "./migration-job.ts"

const image = `europe-southwest1-docker.pkg.dev/proxus-test/proxus/server@sha256:${"a".repeat(64)}`
const events: string[] = []
const volatileDependency = {
  ...fakeResource("dependency"),
  executionCount: 3,
  latestCreatedExecution: { name: "dependency-execution-volatile" },
}
const base: MigrationJobProps = {
  id: "Migrations",
  project: "proxus-test",
  location: "europe-southwest1",
  name: "proxus-migrations",
  image,
  runtimeServiceAccount: "migrations@proxus-test.iam.gserviceaccount.com",
  databaseBinding: {
    access: "ddl",
    kind: "database-url",
    secret: { name: "DATABASE_URL", secretId: "database-ddl" },
    iam: Effect.sync(() => { events.push("database-iam") }),
  },
  secretRefs: [{ name: "SIGNING_KEY", secretId: "signing-key", version: "7" }],
  config: { DATABASE_MIGRATIONS_DIR: "/app/drizzle" },
  labels: { environment: "test" },
  dependencies: [volatileDependency],
}

const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

const fixture = () => {
  let jobProps: JobProps | undefined
  const resources = {
    job: (id: string, props: JobProps) => Effect.sync(() => {
      events.push(`job:${id}`)
      jobProps = props
      return { ...fakeResource(`job:${id}`), project: props.project, location: props.location, name: props.name ?? "generated", resourceName: `projects/${props.project}/locations/${props.location}/jobs/${props.name}` }
    }),
  }
  return { resources, props: () => jobProps }
}

describe("MigrationJob", () => {
  test("composes IAM and dependencies before one declarative real-provider Job", async () => {
    events.length = 0
    const f = fixture()
    const output = await run(composeMigrationJob(base, f.resources))

    expect(events).toEqual(["database-iam", "job:Migrations"])
    expect(output).toMatchObject({
      project: "proxus-test",
      location: "europe-southwest1",
      name: "proxus-migrations",
      resourceName: "projects/proxus-test/locations/europe-southwest1/jobs/proxus-migrations",
    })
    expect(f.props()).toMatchObject({
      project: "proxus-test",
      location: "europe-southwest1",
      name: "proxus-migrations",
      labels: { environment: "test" },
      template: {
        taskCount: 1,
        parallelism: 1,
        template: {
          serviceAccount: base.runtimeServiceAccount,
          maxRetries: 0,
          timeout: "900s",
          executionEnvironment: "EXECUTION_ENVIRONMENT_GEN2",
          containers: [{
            image,
            command: ["node"],
            args: ["/app/migrate.mjs"],
            env: [
              { name: "DATABASE_URL", valueSource: { secretKeyRef: { secret: "database-ddl", version: "latest" } } },
              { name: "SIGNING_KEY", valueSource: { secretKeyRef: { secret: "signing-key", version: "7" } } },
              { name: "DATABASE_MIGRATIONS_DIR", value: "/app/drizzle" },
            ],
          }],
        },
      },
    })
    expect(JSON.stringify(f.props())).not.toContain("secretValue")
  })

  test("matches the normalized Cloud Run v2 live shape without hiding drift", async () => {
    const f = fixture()
    await run(composeMigrationJob(base, f.resources))
    const desired = f.props()!
    const live = {
      labels: { ...desired.labels, alchemy_app: "preview", alchemy_stage: "pr-9999", alchemy_id: "migrationjob" },
      generation: "2",
      observedGeneration: "2",
      template: structuredClone(desired.template),
    }

    expect(live.template).toEqual(desired.template)
    expect(live.template.template?.containers).toEqual(desired.template.template?.containers)
    expect(live.template.template?.containers?.[0]?.env).toEqual(desired.template.template?.containers?.[0]?.env)
    expect(live.template.template?.containers?.[0]?.image).toBe(image)
    expect(live.labels).toMatchObject(desired.labels ?? {})
    expect(live.generation).toBe(live.observedGeneration)
    expect((desired as JobProps & { dependsOn?: unknown }).dependsOn).toEqual(base.dependencies)

    const changedLive = structuredClone(live)
    changedLive.template.template!.containers![0]!.image = image.replace(/a{64}$/, "b".repeat(64))
    expect(changedLive.template).not.toEqual(desired.template)
  })

  test.each([
    ["tag", { image: image.replace(/@sha256:.+$/, ":latest") }],
    ["foreign project", { image: image.replace("/proxus-test/", "/other-project/") }],
    ["secret path", { databaseBinding: { ...base.databaseBinding, secret: { name: "DATABASE_URL", secretId: "projects/p/secrets/db" } } }],
    ["secret/config collision", { config: { DATABASE_URL: "not-allowed" } }],
  ])("rejects invalid %s before creating resources", async (_label, patch) => {
    events.length = 0
    const f = fixture()
    await expect(run(composeMigrationJob({ ...base, ...patch }, f.resources))).rejects.toBeInstanceOf(MigrationJobConfigurationError)
    expect(events).toEqual([])
    expect(f.props()).toBeUndefined()
  })
})
