import * as gcp from "@pulumi/gcp"
import * as pulumi from "@pulumi/pulumi"
import { assertNoPublicPrincipal, projectId, region } from "../config.ts"

const config = new pulumi.Config()
const project = projectId()
const location = region()
const githubRepository = config.require("githubRepository")
const stateBucketName = config.require("stateBucketName")
const stateKmsKeyId = config.require("stateKmsKeyId")

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository)) {
  throw new pulumi.RunError("githubRepository must use the owner/repository form.")
}

const protectedOptions: pulumi.CustomResourceOptions = { protect: true }
const serviceNames = [
  "artifactregistry.googleapis.com",
  "bigquery.googleapis.com",
  "cloudbuild.googleapis.com",
  "cloudkms.googleapis.com",
  "compute.googleapis.com",
  "iap.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "logging.googleapis.com",
  "run.googleapis.com",
  "secretmanager.googleapis.com",
  "sts.googleapis.com",
  "storage.googleapis.com",
]

const services = serviceNames.map((service) => new gcp.projects.Service(
  `api-${service.split(".")[0]}`,
  {
    project,
    service,
    disableDependentServices: false,
    disableOnDestroy: false,
  },
  protectedOptions,
))

const artifactRegistry = new gcp.artifactregistry.Repository("images", {
  project,
  location,
  repositoryId: "proxus",
  description: "Immutable Proxus application images built by Cloud Build",
  format: "DOCKER",
  dockerConfig: { immutableTags: true },
  labels: { system: "proxus-v2", managed_by: "pulumi", layer: "foundation" },
}, { ...protectedOptions, dependsOn: services })

const serviceAccount = (accountId: string, displayName: string) => new gcp.serviceaccount.Account(accountId, {
  project,
  accountId,
  displayName,
}, protectedOptions)

const cloudBuildExecutor = serviceAccount("proxus-cloud-build", "Proxus Cloud Build executor")
const buildSubmitter = serviceAccount("proxus-build-submitter", "Proxus CI Cloud Build submitter")
const productionDeployer = serviceAccount("proxus-production-deployer", "Proxus production Pulumi deployer")
const previewDeployer = serviceAccount("proxus-preview-deployer", "Proxus preview Pulumi deployer")

const projectRole = (name: string, role: string, member: pulumi.Input<string>) => {
  if (typeof member === "string") assertNoPublicPrincipal(member)
  return new gcp.projects.IAMMember(name, { project, role, member }, protectedOptions)
}

projectRole("cloud-build-log-writer", "roles/logging.logWriter", cloudBuildExecutor.email.apply((email) => `serviceAccount:${email}`))
new gcp.artifactregistry.RepositoryIamMember("cloud-build-image-writer", {
  project,
  location,
  repository: artifactRegistry.name,
  role: "roles/artifactregistry.writer",
  member: cloudBuildExecutor.email.apply((email) => `serviceAccount:${email}`),
}, protectedOptions)
new gcp.artifactregistry.RepositoryIamMember("production-image-reader", {
  project,
  location,
  repository: artifactRegistry.name,
  role: "roles/artifactregistry.reader",
  member: productionDeployer.email.apply((email) => `serviceAccount:${email}`),
}, protectedOptions)
projectRole("build-submitter", "roles/cloudbuild.builds.editor", buildSubmitter.email.apply((email) => `serviceAccount:${email}`))

new gcp.serviceaccount.IAMMember("build-submitter-uses-executor", {
  serviceAccountId: cloudBuildExecutor.name,
  role: "roles/iam.serviceAccountUser",
  member: buildSubmitter.email.apply((email) => `serviceAccount:${email}`),
}, protectedOptions)

const roleId = (role: string): string => role.slice(role.indexOf("/") + 1).replaceAll(".", "-")

const productionRoles = [
  "roles/compute.admin",
  "roles/iam.serviceAccountAdmin",
  "roles/iap.admin",
  "roles/run.admin",
  "roles/secretmanager.admin",
  "roles/storage.admin",
]
for (const role of productionRoles) {
  projectRole(`production-${roleId(role)}`, role, productionDeployer.email.apply((email) => `serviceAccount:${email}`))
}

const previewRoles = [
  "roles/iam.serviceAccountAdmin",
  "roles/iap.admin",
  "roles/run.admin",
  "roles/secretmanager.admin",
]
for (const role of previewRoles) {
  projectRole(`preview-${roleId(role)}`, role, previewDeployer.email.apply((email) => `serviceAccount:${email}`))
}

for (const [name, account] of [["production", productionDeployer], ["preview", previewDeployer]] as const) {
  const member = account.email.apply((email) => `serviceAccount:${email}`)
  new gcp.storage.BucketIAMMember(`${name}-state-objects`, {
    bucket: stateBucketName,
    role: "roles/storage.objectAdmin",
    member,
  }, protectedOptions)
  new gcp.storage.BucketIAMMember(`${name}-state-list`, {
    bucket: stateBucketName,
    role: "roles/storage.legacyBucketReader",
    member,
  }, protectedOptions)
  new gcp.kms.CryptoKeyIAMMember(`${name}-state-encryption`, {
    cryptoKeyId: stateKmsKeyId,
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
    member,
  }, protectedOptions)
}

const makeGithubPool = (purpose: "production" | "preview", workflows: readonly string[], ref: string) => {
  const environment = purpose
  const pool = new gcp.iam.WorkloadIdentityPool(`github-${purpose}`, {
    project,
    workloadIdentityPoolId: `github-${purpose}`,
    displayName: `GitHub ${purpose}`,
    description: `Keyless GitHub Actions identities for ${purpose}`,
    disabled: false,
  }, { ...protectedOptions, dependsOn: services })

  const workflowRefs = workflows.map((workflow) => `${githubRepository}/.github/workflows/${workflow}@${ref}`)
  const workflowCondition = workflowRefs.map((workflowRef) => `assertion.workflow_ref == '${workflowRef}'`).join(" || ")
  const subject = `repo:${githubRepository}:environment:${environment}`
  const provider = new gcp.iam.WorkloadIdentityPoolProvider(`github-${purpose}`, {
    project,
    workloadIdentityPoolId: pool.workloadIdentityPoolId,
    workloadIdentityPoolProviderId: "github",
    displayName: `GitHub ${purpose} workflow`,
    attributeMapping: {
      "google.subject": "assertion.sub",
      "attribute.repository": "assertion.repository",
      "attribute.workflow_ref": "assertion.workflow_ref",
    },
    attributeCondition: `assertion.repository == '${githubRepository}' && assertion.sub == '${subject}' && (${workflowCondition})`,
    oidc: { issuerUri: "https://token.actions.githubusercontent.com" },
  }, { ...protectedOptions, dependsOn: [pool] })

  return { pool, provider }
}

const productionIdentity = makeGithubPool("production", ["deploy-production.yml"], "refs/heads/main")
const previewIdentity = makeGithubPool("preview", ["deploy-preview.yml", "reconcile-previews.yml"], "refs/heads/main")

const grantWorkloadIdentity = (
  name: string,
  pool: gcp.iam.WorkloadIdentityPool,
  account: gcp.serviceaccount.Account,
) => new gcp.serviceaccount.IAMMember(name, {
  serviceAccountId: account.name,
  role: "roles/iam.workloadIdentityUser",
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${githubRepository}`,
}, protectedOptions)

for (const [purpose, identity, deployer] of [
  ["production", productionIdentity, productionDeployer],
  ["preview", previewIdentity, previewDeployer],
] as const) {
  grantWorkloadIdentity(`${purpose}-impersonates-build-submitter`, identity.pool, buildSubmitter)
  grantWorkloadIdentity(`${purpose}-impersonates-deployer`, identity.pool, deployer)
}

export const projectIdOutput = project
export const projectNumber = gcp.organizations.getProjectOutput({ projectId: project }).number
export const regionOutput = location
export const artifactRegistryRepository = artifactRegistry.name
export const artifactRegistryBase = pulumi.interpolate`${location}-docker.pkg.dev/${project}/${artifactRegistry.repositoryId}`
export const cloudBuildExecutorEmail = cloudBuildExecutor.email
export const buildSubmitterEmail = buildSubmitter.email
export const productionDeployerEmail = productionDeployer.email
export const previewDeployerEmail = previewDeployer.email
export const productionWorkloadIdentityProvider = productionIdentity.provider.name
export const previewWorkloadIdentityProvider = previewIdentity.provider.name
