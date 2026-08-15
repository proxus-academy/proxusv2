// @effect-diagnostics asyncFunction:off strictBooleanExpressions:off anyUnknownInErrorContext:off
import { Unowned } from "alchemy/AdoptPolicy"
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CloudRunDeletionProtectedError, CloudRunServiceClientError, makeCloudRunServiceProviderService, type CloudRunServiceClient } from "./cloud-run-service.ts"

const run = Effect.runPromise
const session = { note: () => Effect.void } as unknown as ScopedPlanStatusSession
const baseArgs = { id: "Admin", fqn: "prod/Admin", instanceId: "i", session, bindings: [] }
const props = { project: "p", location: "europe-southwest1", name: "admin", labels: { env: "test" }, iapEnabled: true as const, deletionProtection: true, ingress: "INGRESS_TRAFFIC_ALL" as const, invokerIamDisabled: false, scaling: { maxInstanceCount: 2 }, template: { serviceAccount: "runtime@p.iam.gserviceaccount.com", containers: [{ name: "web", image: "example.invalid/web@sha256:abc" }, { name: "api", image: "example.invalid/api@sha256:def" }] } }
const fake = () => {
  let value: any
  const calls: Array<{ op: string; value?: unknown }> = []
  const absent = () => Effect.fail(new CloudRunServiceClientError({ operation: "get", code: "not-found" }))
  const client: CloudRunServiceClient = {
    get: () => value ? Effect.succeed(value) : absent(),
    list: () => Effect.succeed(value ? [value] : []),
    create: (parent, id, body) => { calls.push({ op: "create", value: body }); value = { ...body, name: `${parent}/services/${id}`, uid: "uid", uri: "https://admin.run.app", urls: ["https://admin.run.app"], etag: "1" }; return Effect.succeed(value) },
    patch: (_name, mask, body) => { calls.push({ op: "patch", value: mask }); value = { ...value, ...body, etag: "2" }; return Effect.succeed(value) },
    delete: () => { calls.push({ op: "delete" }); value = undefined; return Effect.void },
  }
  return { client, calls, value: () => value, foreign: () => { value = { name: "projects/p/locations/europe-southwest1/services/admin", labels: {}, template: props.template } } }
}

describe("Cloud Run Service provider", () => {
  it("creates, verifies, updates all required v2 fields, lists and reads owned resources", async () => {
    const f = fake(); const provider = makeCloudRunServiceProviderService(f.client)
    const output = await run(provider.reconcile({ ...baseArgs, news: props, olds: undefined, output: undefined }))
    expect(f.calls[0]?.value).toMatchObject({
      labels: { env: "test", proxus_alchemy_fqn: "prod-admin-ea1248e74ab6" },
      iapEnabled: true, invokerIamDisabled: false, ingress: props.ingress, scaling: props.scaling, template: props.template,
    })
    expect(await run(provider.read!({ ...baseArgs, olds: props, output }))).toMatchObject({ resourceName: output.resourceName, deletionProtection: true })
    expect(await run(provider.list())).toHaveLength(1)
    await run(provider.reconcile({ ...baseArgs, news: { ...props, scaling: { maxInstanceCount: 1 } }, olds: props, output }))
    expect(f.calls.find((call) => call.op === "patch")?.value).toContain("scaling")
  })

  it("accepts the live REST shape that omits boolean and ingress defaults without patching", async () => {
    const f = fake()
    const { invokerIamDisabled: _omittedBooleanDefault, ingress: _omittedIngressDefault, ...liveProps } = props
    const liveShape = { ...liveProps, labels: { ...props.labels, proxus_alchemy_fqn: "prod-admin-ea1248e74ab6" }, name: "projects/p/locations/europe-southwest1/services/admin", uid: "uid" }
    const provider = makeCloudRunServiceProviderService({ ...f.client, get: () => Effect.succeed(liveShape) })
    await expect(run(provider.reconcile({ ...baseArgs, news: props, olds: undefined, output: undefined }))).resolves.toMatchObject({ invokerIamDisabled: false, deletionProtection: true })
    expect(f.calls.some(({ op }) => op === "patch")).toBe(false)
  })

  it("fails closed on security verification and forbidden reads", async () => {
    const f = fake(); const provider = makeCloudRunServiceProviderService({ ...f.client, get: () => Effect.succeed({ ...f.value(), iapEnabled: false }) })
    await expect(run(provider.reconcile({ ...baseArgs, news: props, olds: undefined, output: undefined }))).rejects.toMatchObject({ code: "operation-failed" })
    const wrongIngress = makeCloudRunServiceProviderService({ ...f.client, get: () => Effect.succeed({ ...props, ingress: "INGRESS_TRAFFIC_INTERNAL_ONLY" }) })
    await expect(run(wrongIngress.reconcile({ ...baseArgs, news: props, olds: undefined, output: undefined }))).rejects.toMatchObject({ operation: "verify-security-fields" })
    const forbidden = new CloudRunServiceClientError({ operation: "get", code: "forbidden" })
    await expect(run(makeCloudRunServiceProviderService({ ...f.client, get: () => Effect.fail(forbidden) }).read!({ ...baseArgs, olds: props, output: undefined }))).rejects.toBe(forbidden)
  })

  it("blocks protected deletion, permits explicit deletion, adopts only with owner label and replaces identity", async () => {
    const f = fake(); f.foreign(); const provider = makeCloudRunServiceProviderService(f.client)
    const foreign = await run(provider.read!({ ...baseArgs, olds: props, output: undefined }))
    expect(Unowned.is(foreign)).toBe(true)
    await run(provider.reconcile({ ...baseArgs, fqn: "PreviewServices-pr-9999-Public-Service", news: props, olds: undefined, output: undefined }))
    expect(f.value().labels.proxus_alchemy_fqn).toBe("previewservices-pr-9999-public-service-e010acb32280")
    const output = { ...props, resourceName: "projects/p/locations/europe-southwest1/services/admin", uid: "u", uri: "", urls: [] }
    await expect(run(provider.delete({ ...baseArgs, olds: props, output }))).rejects.toBeInstanceOf(CloudRunDeletionProtectedError)
    await run(provider.delete({ ...baseArgs, olds: props, output: { ...output, deletionProtection: false } }))
    expect(f.calls.at(-1)?.op).toBe("delete")
    expect(await run(provider.diff!({ ...baseArgs, olds: props, news: { ...props, name: "other" }, output, oldBindings: [], newBindings: [] }))).toEqual({ action: "replace" })
  })
})
