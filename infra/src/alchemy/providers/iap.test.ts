// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off strictBooleanExpressions:off
import type { IapAccessPrincipal } from "../iap-access-principal.ts"
import { Effect } from "effect"
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import { describe, expect, it } from "vitest"
import {
  IapClientError,
  IapPrincipalError,
  makeCloudRunIapInvokerProviderService,
  makeIapCloudRunAccessProviderService,
  type IapClient,
  type IapIamPolicy,
} from "./iap.ts"

const run = Effect.runPromise
const session = { note: () => Effect.void } as unknown as ScopedPlanStatusSession
const base = { id: "iam", fqn: "prod/iam", instanceId: "i", session, bindings: [] }
const service = "projects/p/locations/europe-southwest1/services/admin"

const fixture = () => {
  const runPolicies = new Map<string, IapIamPolicy>()
  const iapPolicies = new Map<string, IapIamPolicy>()
  const calls: string[] = []
  const get = (kind: string, policies: Map<string, IapIamPolicy>, name: string) => {
    calls.push(`get:${kind}`)
    const policy = policies.get(name)
    return policy ? Effect.succeed(policy) : Effect.fail(new IapClientError({ operation: "get", code: "not-found" }))
  }
  const set = (kind: string, policies: Map<string, IapIamPolicy>, name: string, policy: IapIamPolicy) => {
    calls.push(`set:${kind}`); policies.set(name, policy); return Effect.void
  }
  const client: IapClient = {
    listCloudRunServices: () => Effect.succeed([...runPolicies.keys()]),
    getCloudRunIamPolicy: (name) => get("run", runPolicies, name),
    setCloudRunIamPolicy: (name, policy) => set("run", runPolicies, name, policy),
    listIapCloudRunServices: () => Effect.succeed([...iapPolicies.keys()]),
    getIapIamPolicy: (name) => get("iap", iapPolicies, name),
    setIapIamPolicy: (name, policy) => set("iap", iapPolicies, name, policy),
  }
  return { runPolicies, iapPolicies, calls, client }
}

const foreign = [
  { role: "roles/run.invoker", members: ["user:foreign@example.test"] },
  { role: "roles/run.invoker", members: ["serviceAccount:service-123@gcp-sa-iap.iam.gserviceaccount.com"], condition: { title: "foreign" } },
  { role: "roles/other", members: ["group:other@example.test"], condition: { title: "keep" } },
]

describe("CloudRunIapInvoker provider", () => {
  it("adds and removes only the IAP service agent, preserving foreign bindings and conditions", async () => {
    const f = fixture(); f.runPolicies.set(service, { etag: "e", version: 3, bindings: foreign })
    const provider = makeCloudRunIapInvokerProviderService(f.client)
    const desired = { service, projectNumber: "123" }
    const output = await run(provider.reconcile({ ...base, news: desired, olds: undefined, output: undefined }))
    await run(provider.reconcile({ ...base, news: desired, olds: desired, output }))
    expect(f.calls.filter((call) => call === "set:run")).toHaveLength(1)
    expect(await run(provider.read!({ ...base, olds: desired, output }))).toEqual(output)
    expect(await run(provider.list())).toContainEqual(output)
    await run(provider.delete({ ...base, olds: desired, output })); await run(provider.delete({ ...base, olds: desired, output }))
    expect(f.runPolicies.get(service)?.bindings).toEqual(foreign)
  })

  it("propagates forbidden as a typed operational error from read, list, reconcile and delete", async () => {
    const f = fixture()
    const forbidden = (operation: string) => Effect.fail(new IapClientError({ operation, code: "forbidden" }))
    const provider = makeCloudRunIapInvokerProviderService({
      ...f.client,
      listCloudRunServices: () => forbidden("list-run"),
      getCloudRunIamPolicy: () => forbidden("get-run-policy"),
    })
    const desired = { service, projectNumber: "123" }
    const output = { ...desired, member: "serviceAccount:service-123@gcp-sa-iap.iam.gserviceaccount.com", role: "roles/run.invoker" as const }

    for (const effect of [
      provider.read!({ ...base, olds: desired, output: undefined }),
      provider.list(),
      provider.reconcile({ ...base, news: desired, olds: undefined, output: undefined }),
      provider.delete({ ...base, olds: desired, output }),
    ]) {
      await expect(run(effect)).rejects.toMatchObject({ _tag: "IapClientError", code: "forbidden" })
    }
  })

  it("rejects a malformed service-agent identity and replaces immutable inputs", async () => {
    const f = fixture(); f.runPolicies.set(service, { bindings: [] })
    const provider = makeCloudRunIapInvokerProviderService(f.client)
    await expect(run(provider.reconcile({ ...base, news: { service, projectNumber: "allUsers" }, olds: undefined, output: undefined })))
      .rejects.toBeInstanceOf(IapPrincipalError)
    expect(await run(provider.diff!({ ...base, olds: { service, projectNumber: "123" }, news: { service, projectNumber: "456" }, output: undefined, oldBindings: [], newBindings: [] })))
      .toEqual({ action: "replace" })
  })
})

describe("IapCloudRunAccess provider", () => {
  it("adopts, reconciles and deletes group access without claiming conditional access", async () => {
    const f = fixture(); const member = "group:admins@example.test" as const
    f.iapPolicies.set(service, { etag: "iap-e", bindings: [
      { role: "roles/iap.httpsResourceAccessor", members: [member], condition: { title: "foreign" } },
      { role: "roles/iap.httpsResourceAccessor", members: ["group:existing@example.test"] },
      { role: "roles/other", members: ["allUsers"] },
    ] })
    const provider = makeIapCloudRunAccessProviderService(f.client)
    const desired = { service, member }
    const output = await run(provider.reconcile({ ...base, news: desired, olds: undefined, output: undefined }))
    await run(provider.reconcile({ ...base, news: desired, olds: desired, output }))
    expect(await run(provider.list())).toEqual([
      { service, member: "group:existing@example.test", role: "roles/iap.httpsResourceAccessor" },
      output,
    ])
    await run(provider.delete({ ...base, olds: desired, output }))
    expect(f.iapPolicies.get(service)?.bindings).toEqual([
      { role: "roles/iap.httpsResourceAccessor", members: [member], condition: { title: "foreign" } },
      { role: "roles/iap.httpsResourceAccessor", members: ["group:existing@example.test"] },
      { role: "roles/other", members: ["allUsers"] },
    ])
  })

  it("propagates forbidden as a typed operational error from read, list, reconcile and delete", async () => {
    const f = fixture()
    const forbidden = (operation: string) => Effect.fail(new IapClientError({ operation, code: "forbidden" }))
    const provider = makeIapCloudRunAccessProviderService({
      ...f.client,
      listIapCloudRunServices: () => forbidden("list-iap"),
      getIapIamPolicy: () => forbidden("get-iap-policy"),
    })
    const desired = { service, member: "group:admins@example.test" as const }
    const output = { ...desired, role: "roles/iap.httpsResourceAccessor" as const }

    for (const effect of [
      provider.read!({ ...base, olds: desired, output: undefined }),
      provider.list(),
      provider.reconcile({ ...base, news: desired, olds: undefined, output: undefined }),
      provider.delete({ ...base, olds: desired, output }),
    ]) {
      await expect(run(effect)).rejects.toMatchObject({ _tag: "IapClientError", code: "forbidden" })
    }
  })

  it("replaces the grant when access changes from an individual user to a group", async () => {
    const f = fixture(); const provider = makeIapCloudRunAccessProviderService(f.client)
    const user = { service, member: "user:javier@proxus.es" as const }
    const group = { service, member: "group:admins@example.test" as const }
    expect(await run(provider.diff!({ ...base, news: group, olds: user, output: { ...user, role: "roles/iap.httpsResourceAccessor" }, oldBindings: [], newBindings: [] })))
      .toEqual({ action: "replace" })
  })

  it.each(["allUsers", "allAuthenticatedUsers", "serviceAccount:admin@example.test", "domain:example.test", "projectOwner:example", "user:invalid"])("rejects unsafe access principal %s", async (member) => {
    const f = fixture(); f.iapPolicies.set(service, { bindings: [] })
    const provider = makeIapCloudRunAccessProviderService(f.client)
    await expect(run(provider.reconcile({ ...base, news: { service, member: member as IapAccessPrincipal }, olds: undefined, output: undefined })))
      .rejects.toBeInstanceOf(IapPrincipalError)
    expect(f.calls).not.toContain("set:iap")
  })
})
