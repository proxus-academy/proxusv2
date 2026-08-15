// @effect-diagnostics asyncFunction:off unsafeEffectTypeAssertion:off anyUnknownInErrorContext:off
import type { IapAccessPrincipal } from "../iap-access-principal.ts"
import type { ServiceProps } from "@microagi/alchemy-gcp"
import type { Output } from "alchemy/Output"
import * as Effect from "effect/Effect"
import { fakeResource } from "../test-resource.ts"
import { describe, expect, test } from "vitest"
import { composeIapProtectedService, IapProtectedServiceConfigurationError, type IapProtectedServiceProps } from "./iap-protected-service.ts"

const events: string[] = []
const base: IapProtectedServiceProps = {
  id: "Admin",
  project: "proxus-test",
  projectNumber: "123456789",
  location: "europe-southwest1",
  name: "proxus-admin",
  runtimeServiceAccount: "admin@proxus-test.iam.gserviceaccount.com",
  containers: [{ image: "example.invalid/admin@sha256:abc" }],
  labels: { environment: "test" },
  maxInstances: 2,
  dependencies: [fakeResource("dependency")],
  accessPrincipal: "group:admins@example.test",
  deletionPolicy: "retain",
}
const run = <A>(effect: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

const fixture = (capabilities = { iapEnabled: true, deletionProtection: true }) => {
  let serviceProps: (ServiceProps & { iapEnabled: true; deletionProtection: boolean }) | undefined
  const grants: unknown[] = []
  return {
    resources: {
      capabilities,
      service: (id: string, props: ServiceProps & { iapEnabled: true; deletionProtection: boolean }) => Effect.sync(() => {
        events.push(`service:${id}`); serviceProps = props
        return { project: props.project, location: props.location, name: props.name!, resourceName: `projects/${props.project}/locations/${props.location}/services/${props.name}`, uri: "https://admin.run.app" }
      }),
      invoker: (id: string, props: { service: string | Output<string>; projectNumber: string }) => Effect.sync(() => { events.push(`invoker:${id}`); grants.push(props) }),
      access: (id: string, props: { service: string | Output<string>; member: IapAccessPrincipal }) => Effect.sync(() => { events.push(`access:${id}`); grants.push(props) }),
    },
    serviceProps: () => serviceProps,
    grants,
  }
}

describe("IapProtectedService", () => {
  test("declares direct IAP before granting only the IAP agent and configured access principal", async () => {
    events.length = 0
    const f = fixture()
    const output = await run(composeIapProtectedService(base, f.resources))
    const resourceName = "projects/proxus-test/locations/europe-southwest1/services/proxus-admin"

    expect(events).toEqual(["service:Admin-Service", "invoker:Admin-IapInvoker", "access:Admin-IapAccess"])
    expect(f.serviceProps()).toMatchObject({
      iapEnabled: true,
      deletionProtection: true,
      invokerIamDisabled: false,
      scaling: { maxInstanceCount: 2 },
      template: { serviceAccount: base.runtimeServiceAccount, containers: base.containers },
    })
    expect(f.grants).toEqual([
      { service: resourceName, projectNumber: "123456789" },
      { service: resourceName, member: "group:admins@example.test" },
    ])
    expect(JSON.stringify(f.grants)).not.toMatch(/allUsers|allAuthenticatedUsers/)
    expect(output.resourceName).toBe(resourceName)
  })

  test("maps explicit delete policy to disabled API deletion protection", async () => {
    const f = fixture()
    await run(composeIapProtectedService({ ...base, dependencies: [], deletionPolicy: "delete" }, f.resources))
    expect(f.serviceProps()?.deletionProtection).toBe(false)
  })

  test.each([
    ["direct IAP", { iapEnabled: false, deletionProtection: true }],
    ["deletion protection", { iapEnabled: true, deletionProtection: false }],
  ])("fails before any dependency or resource when upstream lacks %s", async (_label, capabilities) => {
    events.length = 0
    const f = fixture(capabilities)
    await expect(run(composeIapProtectedService(base, f.resources))).rejects.toMatchObject({ _tag: "IapProtectedServiceConfigurationError", message: expect.stringContaining("refusing an insecure approximation") })
    expect(events).toEqual([])
    expect(f.serviceProps()).toBeUndefined()
    expect(f.grants).toEqual([])
  })

  test.each(["allUsers", "allAuthenticatedUsers", "serviceAccount:admin@example.test", "domain:example.test", "projectOwner:example", "group:invalid", "user:invalid"])("rejects unsafe principal %s before resources", async (principal) => {
    events.length = 0
    const f = fixture()
    await expect(run(composeIapProtectedService({ ...base, accessPrincipal: principal as IapAccessPrincipal }, f.resources))).rejects.toBeInstanceOf(IapProtectedServiceConfigurationError)
    expect(events).toEqual([])
  })

  test("grants exactly a configured individual user", async () => {
    const f = fixture()
    await run(composeIapProtectedService({ ...base, accessPrincipal: "user:javier@proxus.es" }, f.resources))
    expect(f.grants[1]).toMatchObject({ member: "user:javier@proxus.es" })
  })

})
