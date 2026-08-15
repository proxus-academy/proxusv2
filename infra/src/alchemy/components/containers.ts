import * as Data from "effect/Data"
import type { IapProtectedContainer } from "./iap-protected-service.ts"
import type { MigrationSecretRef } from "./migration-job.ts"

export type ProxusContainer = IapProtectedContainer

export interface BackendContainerProps {
  readonly project: string
  readonly location: string
  readonly image: string
  readonly port: number
  /** Exposes the port when this is the ingress container. Sidecars must leave it false. */
  readonly ingress?: boolean
  /** Explicitly non-secret environment configuration. */
  readonly config?: Readonly<Record<string, string>>
  /** Existing Secret Manager references. Secret values are deliberately not accepted. */
  readonly secretRefs?: ReadonlyArray<MigrationSecretRef>
}

export interface FrontendProxyContainerProps {
  readonly project: string
  readonly location: string
  readonly image: string
  readonly publicApiOrigin: string
  readonly adminApiOrigin?: string
}

export class ContainerConfigurationError extends Data.TaggedError("ContainerConfigurationError")<{
  readonly message: string
}> {}

const envName = /^[A-Z_][A-Z0-9_]*$/
const secretId = /^[A-Za-z0-9_-]+$/
const secretVersion = /^(latest|[1-9][0-9]*)$/
const digest = /^[a-z0-9-]+-docker\.pkg\.dev\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/
const containerName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const fail = (message: string): never => { throw new ContainerConfigurationError({ message }) }

const validateImage = (props: Pick<BackendContainerProps, "project" | "location" | "image">): void => {
  if (!digest.test(props.image)) fail("image must be an Artifact Registry URI pinned by sha256 digest")
  if (!props.image.startsWith(`${props.location}-docker.pkg.dev/${props.project}/`)) {
    fail("image must belong to the configured project and regional Artifact Registry location")
  }
}

const environment = (config: Readonly<Record<string, string>>, refs: ReadonlyArray<MigrationSecretRef>) => {
  const names = new Set<string>()
  const secrets = refs.map((ref) => {
    if (!envName.test(ref.name)) fail(`invalid secret environment name: ${ref.name}`)
    if (!secretId.test(ref.secretId)) fail("secret refs must contain IDs, never paths or values")
    if (ref.version !== undefined && !secretVersion.test(ref.version)) fail(`invalid secret version for ${ref.name}`)
    if (names.has(ref.name)) fail(`duplicate environment name: ${ref.name}`)
    names.add(ref.name)
    return { name: ref.name, valueSource: { secretKeyRef: { secret: ref.secretId, version: ref.version ?? "latest" } } }
  })
  const values = Object.entries(config).map(([name, value]) => {
    if (!envName.test(name)) fail(`invalid config environment name: ${name}`)
    if (names.has(name)) fail(`config cannot override secret environment: ${name}`)
    names.add(name)
    return { name, value }
  })
  return [...secrets, ...values]
}

const backend = (name: "public-api" | "admin-api", props: BackendContainerProps): ProxusContainer => {
  validateImage(props)
  if (!containerName.test(name)) fail(`invalid container name: ${name}`)
  if (!Number.isSafeInteger(props.port) || props.port < 1 || props.port > 65_535) fail("port must be an integer between 1 and 65535")
  const config = { ...(props.config ?? {}) }
  if (config.PORT !== undefined && config.PORT !== String(props.port)) fail("PORT config must match the container port")
  config.PORT = String(props.port)

  return {
    name,
    image: props.image,
    ...(props.ingress === true ? { ports: [{ containerPort: props.port }] } : {}),
    env: environment(config, props.secretRefs ?? []),
    resources: { limits: { cpu: "1", memory: "512Mi" }, cpuIdle: true, startupCpuBoost: true },
    startupProbe: { tcpSocket: { port: props.port }, initialDelaySeconds: 0, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 30 },
  }
}

/** Public Node/PostgreSQL API container. */
export const publicBackendContainer = (props: BackendContainerProps): ProxusContainer => backend("public-api", props)

/** Administrative Node/PostgreSQL API container. */
export const adminBackendContainer = (props: BackendContainerProps): ProxusContainer => backend("admin-api", props)

/** Static frontend server which proxies to named localhost backend sidecars. */
export const frontendProxyContainer = (props: FrontendProxyContainerProps): ProxusContainer => {
  validateImage(props)
  const admin = props.adminApiOrigin === undefined ? [] : ["admin-api"]
  return {
    name: "frontend",
    image: props.image,
    dependsOn: ["public-api", ...admin],
    ports: [{ containerPort: 8080 }],
    env: [
      { name: "PUBLIC_API_ORIGIN", value: props.publicApiOrigin },
      ...(props.adminApiOrigin === undefined ? [] : [{ name: "ADMIN_API_ORIGIN", value: props.adminApiOrigin }]),
    ],
    resources: { limits: { cpu: "1", memory: "256Mi" }, cpuIdle: true, startupCpuBoost: true },
    startupProbe: { tcpSocket: { port: 8080 }, initialDelaySeconds: 0, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 15 },
  }
}
