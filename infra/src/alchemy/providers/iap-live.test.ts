// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { makeLiveIapClient, type DistilledIapOperations } from "./iap-live.ts"

const service = "projects/proxus/locations/europe-southwest1/services/admin"
const iapResource = "projects/proxus/iap_web/cloud_run-europe-southwest1/services/admin"
const run = Effect.runPromise

const fixture = () => {
  const listRunServices = vi.fn<DistilledIapOperations["listRunServices"]>(() => Effect.succeed({ services: [{ name: service }] }))
  const getRunPolicy = vi.fn<DistilledIapOperations["getRunPolicy"]>(() => Effect.succeed({ etag: "run-etag", version: 3, bindings: [{ role: "roles/run.invoker", members: ["user:x@example.test"], condition: { title: "keep" } }] }))
  const setRunPolicy = vi.fn<DistilledIapOperations["setRunPolicy"]>(() => Effect.void)
  const getIapPolicy = vi.fn<DistilledIapOperations["getIapPolicy"]>(() => Effect.succeed({ etag: "iap-etag", version: 3, bindings: [{ role: "roles/iap.httpsResourceAccessor", members: ["group:x@example.test"], condition: { title: "keep" } }] }))
  const setIapPolicy = vi.fn<DistilledIapOperations["setIapPolicy"]>(() => Effect.void)
  const operations = { listRunServices, getRunPolicy, setRunPolicy, getIapPolicy, setIapPolicy }
  return { operations, client: makeLiveIapClient({ project: "proxus", location: "europe-southwest1", operations }) }
}

describe("IAP live adapters", () => {
  it("uses policy version 3 and preserves etag and conditions on both IAM surfaces", async () => {
    const f = fixture()
    const runPolicy = await run(f.client.getCloudRunIamPolicy(service))
    const iapPolicy = await run(f.client.getIapIamPolicy(service))
    await run(f.client.setCloudRunIamPolicy(service, runPolicy))
    await run(f.client.setIapIamPolicy(service, iapPolicy))

    expect(f.operations.getRunPolicy).toHaveBeenCalledWith({ resource: service, "options.requestedPolicyVersion": 3 })
    expect(f.operations.getIapPolicy).toHaveBeenCalledWith({ resource: iapResource, body: { options: { requestedPolicyVersion: 3 } } })
    expect(f.operations.setRunPolicy.mock.calls[0]?.[0].body).toMatchObject({ updateMask: "bindings,etag,version", policy: { etag: "run-etag", version: 3, bindings: [{ condition: { title: "keep" } }] } })
    expect(f.operations.setIapPolicy.mock.calls[0]?.[0].body).toMatchObject({ updateMask: "bindings,etag,version", policy: { etag: "iap-etag", version: 3, bindings: [{ condition: { title: "keep" } }] } })
  })

  it("lists without cloud and maps 404 to absence while 403 fails closed", async () => {
    const f = fixture()
    expect(await run(f.client.listCloudRunServices())).toEqual([service])
    expect(await run(f.client.listIapCloudRunServices())).toEqual([service])

    f.operations.getRunPolicy.mockImplementationOnce(() => Effect.fail({ _tag: "NotFound" }))
    await expect(run(f.client.getCloudRunIamPolicy(service))).rejects.toMatchObject({ code: "not-found" })
    f.operations.getIapPolicy.mockImplementationOnce(() => Effect.fail({ _tag: "Forbidden" }))
    await expect(run(f.client.getIapIamPolicy(service))).rejects.toMatchObject({ code: "forbidden" })
  })
})
