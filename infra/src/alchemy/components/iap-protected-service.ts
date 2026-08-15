// @effect-diagnostics anyUnknownInErrorContext:off
import { isIapAccessPrincipal, type IapAccessPrincipal } from "../iap-access-principal.ts"
import type { ServiceProps } from "@microagi/alchemy-gcp"
import type { Output } from "alchemy/Output"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { CloudRunService, type CloudRunServiceAttributes, type CloudRunServiceProps } from "../providers/cloud-run-service.ts"
import type { ResourceDependency } from "../resource-dependency.ts"
import { CloudRunIapInvoker, IapCloudRunAccess } from "../providers/iap.ts"

export type IapProtectedContainer = NonNullable<ServiceProps["template"]["containers"]>[number]

export interface IapProtectedServiceProps {
  readonly id: string
  readonly project: string
  readonly projectNumber: string
  readonly location: string
  readonly name: string
  readonly runtimeServiceAccount: string
  readonly containers: ReadonlyArray<IapProtectedContainer>
  readonly labels?: Readonly<Record<string, string>>
  readonly maxInstances: number
  readonly dependencies: ReadonlyArray<ResourceDependency>
  readonly accessPrincipal: IapAccessPrincipal
  /** `retain` enables the provider's fail-closed deletion guard; Cloud Run v2 has no API deletion-protection field. */
  readonly deletionPolicy: "retain" | "delete"
}

export interface IapProtectedServiceOutputs {
  readonly project: string | Output<string>
  readonly location: string | Output<string>
  readonly name: string | Output<string>
  readonly resourceName: string | Output<string>
  readonly uri: string | Output<string>
}

export class IapProtectedServiceConfigurationError extends Data.TaggedError("IapProtectedServiceConfigurationError")<{
  readonly message: string
}> {}

type ProtectedServiceProps = CloudRunServiceProps & { readonly iapEnabled: true }
type ServiceOutput = Pick<CloudRunServiceAttributes, "project" | "location" | "name" | "resourceName" | "uri">

interface IapProtectedServiceResources {
  /** Capabilities of the installed upstream Service provider, not of the GCP API. */
  readonly capabilities: { readonly iapEnabled: boolean; readonly deletionProtection: boolean }
  readonly service: (id: string, props: ProtectedServiceProps) => Effect.Effect<ServiceOutput, unknown, unknown>
  readonly invoker: (id: string, props: { service: string | Output<string>; projectNumber: string }) => Effect.Effect<unknown, unknown, unknown>
  readonly access: (id: string, props: { service: string | Output<string>; member: IapAccessPrincipal }) => Effect.Effect<unknown, unknown, unknown>
}

const realResources: IapProtectedServiceResources = {
  capabilities: { iapEnabled: true, deletionProtection: true },
  service: (id, props) => CloudRunService(id, props).pipe(Effect.map((service) => service as unknown as ServiceOutput)),
  invoker: CloudRunIapInvoker,
  access: IapCloudRunAccess,
}

const fail = (message: string): never => { throw new IapProtectedServiceConfigurationError({ message }) }
const validate = (props: IapProtectedServiceProps, resources: IapProtectedServiceResources): void => {
  if (!isIapAccessPrincipal(props.accessPrincipal)) {
    fail("accessPrincipal must be user:<email> or group:<email>")
  }
  if (!/^[0-9]+$/.test(props.projectNumber)) fail("projectNumber must be numeric")
  if (!Number.isSafeInteger(props.maxInstances) || props.maxInstances < 1) fail("maxInstances must be a positive integer")
  if (props.containers.length === 0) fail("at least one container is required")
  const missing = [!resources.capabilities.iapEnabled && "iapEnabled", !resources.capabilities.deletionProtection && "deletionProtection"].filter(Boolean)
  if (missing.length > 0) fail(`upstream Cloud Run Service lacks required capabilities: ${missing.join(", ")}; refusing an insecure approximation`)
}

/** Internal seam for cloud-free composition tests. */
export const composeIapProtectedService = (props: IapProtectedServiceProps, resources: IapProtectedServiceResources) =>
  Effect.gen(function* () {
    validate(props, resources)
    const service = yield* resources.service(`${props.id}-Service`, {
      project: props.project,
      location: props.location,
      name: props.name,
      ...(props.labels === undefined ? {} : { labels: { ...props.labels } }),
      iapEnabled: true,
      deletionProtection: props.deletionPolicy === "retain",
      invokerIamDisabled: false,
      scaling: { maxInstanceCount: props.maxInstances },
      template: { serviceAccount: props.runtimeServiceAccount, containers: [...props.containers] },
      dependsOn: props.dependencies,
    })
    // Alchemy resolves Output interpolation while synthesizing dependent resources.
    const serviceName = service.resourceName
    yield* resources.invoker(`${props.id}-IapInvoker`, { service: serviceName, projectNumber: props.projectNumber })
    yield* resources.access(`${props.id}-IapAccess`, { service: serviceName, member: props.accessPrincipal })
    return service satisfies IapProtectedServiceOutputs
  })

/** Direct-IAP service backed by Proxus' fail-closed Cloud Run v2 provider. */
export const IapProtectedService = (props: IapProtectedServiceProps) => composeIapProtectedService(props, realResources)
