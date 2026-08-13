import * as gcp from "@pulumi/gcp"
import * as pulumi from "@pulumi/pulumi"
import { assertNoPublicPrincipal } from "../config.ts"

export type CloudRunContainer = gcp.types.input.cloudrunv2.ServiceTemplateContainer

interface RuntimeIdentityArgs {
  readonly project: string
  readonly accountId: string
  readonly displayName: string
  readonly deployerEmail: pulumi.Input<string>
  readonly databaseSecretId?: string
}

export const createRuntimeIdentity = (name: string, args: RuntimeIdentityArgs) => {
  const account = new gcp.serviceaccount.Account(name, {
    project: args.project,
    accountId: args.accountId,
    displayName: args.displayName,
  })

  const deployerCanUse = new gcp.serviceaccount.IAMMember(`${name}-deployer-user`, {
    serviceAccountId: account.name,
    role: "roles/iam.serviceAccountUser",
    member: pulumi.interpolate`serviceAccount:${args.deployerEmail}`,
  })

  const databaseAccess = args.databaseSecretId === undefined
    ? undefined
    : new gcp.secretmanager.SecretIamMember(`${name}-database-access`, {
      project: args.project,
      secretId: args.databaseSecretId,
      role: "roles/secretmanager.secretAccessor",
      member: account.email.apply((email) => `serviceAccount:${email}`),
    }, { dependsOn: [account] })

  return { account, deployerCanUse, databaseAccess }
}

export const secretEnvironment = (name: string, secret: string) => ({
  name,
  valueSource: { secretKeyRef: { secret, version: "latest" } },
})

interface IapServiceArgs {
  readonly project: string
  readonly projectNumber: pulumi.Input<string>
  readonly location: string
  readonly serviceName: string
  readonly runtimeServiceAccount: pulumi.Input<string>
  readonly iapPrincipal: string
  readonly containers: pulumi.Input<CloudRunContainer>[]
  readonly labels: Record<string, string>
  readonly maxInstances: number
  readonly dependsOn?: pulumi.Resource[]
  readonly deletionProtection?: boolean
}

export const createIapService = (name: string, args: IapServiceArgs) => {
  assertNoPublicPrincipal(args.iapPrincipal)
  const service = new gcp.cloudrunv2.Service(name, {
    project: args.project,
    location: args.location,
    name: args.serviceName,
    description: "IAP-protected Proxus service managed by Pulumi",
    deletionProtection: args.deletionProtection ?? false,
    ingress: "INGRESS_TRAFFIC_ALL",
    iapEnabled: true,
    invokerIamDisabled: false,
    labels: args.labels,
    scaling: { maxInstanceCount: args.maxInstances },
    template: {
      serviceAccount: args.runtimeServiceAccount,
      timeout: "60s",
      maxInstanceRequestConcurrency: 40,
      containers: args.containers,
    },
  }, args.dependsOn === undefined ? {} : { dependsOn: args.dependsOn })

  const iapServiceAgent = pulumi.interpolate`serviceAccount:service-${args.projectNumber}@gcp-sa-iap.iam.gserviceaccount.com`
  const iapInvoker = new gcp.cloudrunv2.ServiceIamMember(`${name}-iap-invoker`, {
    project: args.project,
    location: args.location,
    name: service.name,
    role: "roles/run.invoker",
    member: iapServiceAgent,
  })
  const iapAccess = new gcp.iap.WebCloudRunServiceIamMember(`${name}-iap-access`, {
    project: args.project,
    location: args.location,
    cloudRunServiceName: service.name,
    role: "roles/iap.httpsResourceAccessor",
    member: args.iapPrincipal,
  }, { dependsOn: [service, iapInvoker] })

  return { service, iapInvoker, iapAccess }
}

interface MigrationJobArgs {
  readonly project: string
  readonly location: string
  readonly jobName: string
  readonly image: string
  readonly runtimeServiceAccount: pulumi.Input<string>
  readonly databaseSecretId: string
  readonly labels: Record<string, string>
  readonly deletionProtection: boolean
  readonly dependsOn?: pulumi.Resource[]
}

export const createMigrationJob = (name: string, args: MigrationJobArgs) => new gcp.cloudrunv2.Job(name, {
  project: args.project,
  location: args.location,
  name: args.jobName,
  deletionProtection: args.deletionProtection,
  labels: args.labels,
  template: {
    taskCount: 1,
    parallelism: 1,
    template: {
      serviceAccount: args.runtimeServiceAccount,
      maxRetries: 0,
      timeout: "900s",
      containers: [{
        image: args.image,
        commands: ["node"],
        args: ["/app/migrate.mjs"],
        envs: [
          secretEnvironment("DATABASE_URL", args.databaseSecretId),
          { name: "DATABASE_MIGRATIONS_DIR", value: "/app/drizzle" },
        ],
        resources: { limits: { cpu: "1", memory: "512Mi" } },
      }],
    },
  },
}, args.dependsOn === undefined ? {} : { dependsOn: args.dependsOn })
