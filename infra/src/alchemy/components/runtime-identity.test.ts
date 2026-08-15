// @effect-diagnostics asyncFunction:off unsafeEffectTypeAssertion:off anyUnknownInErrorContext:off
import { asOutput, type Output } from "alchemy/Output"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { fakeResource } from "../test-resource.ts"
import { composeRuntimeIdentity, RuntimeIdentityConfigurationError, type RuntimeIdentityProps } from "./runtime-identity.ts"

const base: RuntimeIdentityProps = {
  id: "ApiRuntime",
  projectId: "proxus-test",
  accountId: "proxus-api-runtime",
  deployer: "serviceAccount:deployer@proxus-test.iam.gserviceaccount.com",
  iamDatabaseAuthentication: true,
  secretIds: ["database-url", "mailgun-key", "database-url"],
  bigQueryDataset: "projects/proxus-test/datasets/analytics",
}
const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

const recorder = () => {
  const calls: Array<{ kind: string; id?: string; value: unknown }> = []
  return {
    calls,
    resources: {
      serviceAccount: (id: string, value: unknown): Effect.Effect<{ email: string | Output<string>; name: string | Output<string>; target: ReturnType<typeof fakeResource> }> => Effect.sync(() => {
        calls.push({ kind: "account", id, value })
        return { email: "proxus-api-runtime@proxus-test.iam.gserviceaccount.com", name: "projects/proxus-test/serviceAccounts/proxus-api-runtime@proxus-test.iam.gserviceaccount.com", target: fakeResource("account-target") }
      }),
      serviceAccountGrant: (target: unknown, key: string, value: unknown) => Effect.sync(() => { calls.push({ kind: "accountGrant", id: key, value: { target, value } }) }),
      projectGrant: (id: string, value: unknown) => Effect.sync(() => { calls.push({ kind: "projectGrant", id, value }); return fakeResource(`${id}`) }),
      secretGrant: (id: string, value: unknown) => Effect.sync(() => { calls.push({ kind: "secretGrant", id, value }); return fakeResource(`${id}`) }),
      datasetGrant: (id: string, value: unknown) => Effect.sync(() => { calls.push({ kind: "datasetGrant", id, value }); return fakeResource(`${id}`) }),
    },
  }
}

describe("RuntimeIdentity", () => {
  test("composes one account and only the requested least-privilege grants", async () => {
    const { calls, resources } = recorder()
    const output = await run(composeRuntimeIdentity(base, resources))

    expect(calls.map((call) => [call.kind, call.id])).toEqual([
      ["account", "ApiRuntime-ServiceAccount"],
      ["accountGrant", "Deployer-ServiceAccountUser"],
      ["projectGrant", "ApiRuntime-CloudSqlClient"],
      ["projectGrant", "ApiRuntime-CloudSqlInstanceUser"],
      ["secretGrant", "ApiRuntime-SecretAccessor-0"],
      ["secretGrant", "ApiRuntime-SecretAccessor-1"],
      ["datasetGrant", "ApiRuntime-BigQueryDatasetWriter"],
    ])
    const grants = calls.filter((call) => call.kind.endsWith("Grant") && call.kind !== "accountGrant")
    expect(grants.map((call) => (call.value as any).dependsOn.at(-1).FQN)).toEqual([
      "account-target", "ApiRuntime-CloudSqlClient", "ApiRuntime-CloudSqlInstanceUser",
      "ApiRuntime-SecretAccessor-0", "ApiRuntime-SecretAccessor-1",
    ])
    expect(output).toMatchObject({ email: "proxus-api-runtime@proxus-test.iam.gserviceaccount.com", name: "projects/proxus-test/serviceAccounts/proxus-api-runtime@proxus-test.iam.gserviceaccount.com" })
  })

  test("composes grants while the service-account outputs are unresolved", async () => {
    const { calls, resources } = recorder()
    const unresolvedEmail = asOutput(Effect.never) as Output<string>
    const unresolvedName = asOutput(Effect.never) as Output<string>
    resources.serviceAccount = (id: string, value: unknown) => Effect.sync(() => {
      calls.push({ kind: "account", id, value })
      return { email: unresolvedEmail, name: unresolvedName, target: fakeResource("account-target") }
    })

    const output = await run(composeRuntimeIdentity({ ...base, secretIds: [] }, resources))

    expect(output.email).toBe("proxus-api-runtime@proxus-test.iam.gserviceaccount.com")
    expect(output.name).toBe(unresolvedName)
    expect(calls.filter((call) => call.kind === "projectGrant").map((call) => [call.id, (call.value as any).member])).toEqual([
      ["ApiRuntime-CloudSqlClient", "serviceAccount:proxus-api-runtime@proxus-test.iam.gserviceaccount.com"],
      ["ApiRuntime-CloudSqlInstanceUser", "serviceAccount:proxus-api-runtime@proxus-test.iam.gserviceaccount.com"],
    ])
  })

  test("omits instance-user and BigQuery when IAM DB auth and analytics are disabled", async () => {
    const { calls, resources } = recorder()
    const { bigQueryDataset: _, ...withoutDataset } = base
    await run(composeRuntimeIdentity({ ...withoutDataset, iamDatabaseAuthentication: false, secretIds: [] }, resources))
    expect(calls.filter((call) => call.kind.endsWith("Grant")).map((call) => call.id)).toEqual(["Deployer-ServiceAccountUser", "ApiRuntime-CloudSqlClient"])
  })

  test.each(["allUsers", "allAuthenticatedUsers"])("rejects public deployer %s before composition", async (deployer) => {
    const { calls, resources } = recorder()
    await expect(run(composeRuntimeIdentity({ ...base, deployer }, resources))).rejects.toBeInstanceOf(RuntimeIdentityConfigurationError)
    expect(calls).toEqual([])
  })
})
