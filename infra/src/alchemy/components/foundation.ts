import * as GCP from "@microagi/alchemy-gcp"
import { adopt } from "alchemy/AdoptPolicy"
import { retain } from "alchemy/RemovalPolicy"
import { Effect } from "effect"
import type { FoundationConfig } from "../foundation-config.ts"
import { CryptoKeyIamMember } from "../providers/cloud-kms.ts"

export const foundationApiNames = ["artifactregistry.googleapis.com", "bigquery.googleapis.com", "cloudbuild.googleapis.com", "cloudkms.googleapis.com", "compute.googleapis.com", "iap.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "logging.googleapis.com", "run.googleapis.com", "secretmanager.googleapis.com", "sts.googleapis.com", "storage.googleapis.com"] as const
export const productionRoles = ["roles/compute.admin", "roles/iam.serviceAccountAdmin", "roles/iap.admin", "roles/run.admin", "roles/secretmanager.admin", "roles/storage.admin"] as const
export const previewRoles = ["roles/cloudsql.admin", "roles/iam.serviceAccountAdmin", "roles/iap.admin", "roles/run.admin", "roles/secretmanager.admin", "roles/serviceusage.serviceUsageAdmin"] as const
export const assertPrivateMember = (member: string) => { if (member === "allUsers" || member === "allAuthenticatedUsers") throw new Error("public IAM principals are forbidden"); return member }
export const cloudBuildSourceViewerGrant = (c: Pick<FoundationConfig, "project" | "cloudBuildSourceBucket">) => ({ bucket: c.cloudBuildSourceBucket, role: "roles/storage.objectViewer" as const, member: assertPrivateMember(`serviceAccount:proxus-cloud-build@${c.project}.iam.gserviceaccount.com`) })
export const stateBackendPrincipals = (c: Pick<FoundationConfig, "foundationDeployerPrincipal" | "project">) => [
  ["Foundation", assertPrivateMember(c.foundationDeployerPrincipal)],
  ["Production", assertPrivateMember(`serviceAccount:proxus-production-deployer@${c.project}.iam.gserviceaccount.com`)],
  ["Preview", assertPrivateMember(`serviceAccount:proxus-preview-deployer@${c.project}.iam.gserviceaccount.com`)],
] as const
const protectedResource = <A, R>(effect: Effect.Effect<A, never, R>, adoptExisting: boolean): Effect.Effect<A, never, R> => effect.pipe(retain(), adopt(adoptExisting))

/** Concrete GCP lookup keys used by providers during state-less adoption plans. */
export const foundationPhysicalIds = (c: Pick<FoundationConfig, "project" | "projectNumber" | "region" | "cloudBuildSourceBucket">) => ({
  project: c.project,
  cloudBuildSourceBucket: c.cloudBuildSourceBucket,
  repository: `projects/${c.project}/locations/${c.region}/repositories/proxus`,
  serviceAccount: (accountId: string) => `projects/${c.project}/serviceAccounts/${accountId}@${c.project}.iam.gserviceaccount.com`,
  workloadIdentityPool: (purpose: "production" | "preview") => `projects/${c.projectNumber}/locations/global/workloadIdentityPools/github-${purpose}`,
  workloadIdentityProvider: (purpose: "production" | "preview") => `projects/${c.projectNumber}/locations/global/workloadIdentityPools/github-${purpose}/providers/github`,
})

export const Foundation = (c: FoundationConfig) => Effect.gen(function* () {
  // The project is the adoption anchor. Existing projects are never silently claimed: without
  // ALCHEMY_ADOPT_EXISTING=true the provider returns Unowned and the plan fails before mutation.
  const project = yield* protectedResource(GCP.Project("FoundationProject", { projectId: c.project, displayName: c.projectDisplayName, parent: c.projectParent, labels: { system: "proxus-v2", layer: "foundation", managed_by: "alchemy" } }), c.adoptExisting)
  // Adoption identities must be concrete during a cold plan. Routing immutable IDs through
  // Outputs of other resources makes them unresolved before state exists, so Alchemy cannot
  // call provider.read and misleadingly reports a physical create for resources that already
  // exist. Dependencies are still enforced by yielding the API resources before consumers.
  for (const service of foundationApiNames) yield* protectedResource(GCP.ApiEnable(`Api-${service.split(".")[0]}`, { project: c.project, service }), c.adoptExisting)
  const repositoryName = foundationPhysicalIds(c).repository
  const repository = yield* protectedResource(GCP.ArtifactRegistryRepository("Images", { project: c.project, location: c.region, name: "proxus", format: "DOCKER", description: "Immutable Proxus application images built by Cloud Build", dockerConfig: { immutableTags: true }, labels: { system: "proxus-v2", layer: "foundation", managed_by: "alchemy" } }), c.adoptExisting)
  const account = (id: string, displayName: string) => protectedResource(GCP.ServiceAccount(id, { project: c.project, accountId: id, displayName }), c.adoptExisting)
  const executor = yield* account("proxus-cloud-build", "Proxus Cloud Build executor")
  const submitter = yield* account("proxus-build-submitter", "Proxus CI Cloud Build submitter")
  const sourceBucket = yield* protectedResource(GCP.StorageBucket("CloudBuildSource", {
    project: c.project,
    name: c.cloudBuildSourceBucket,
    location: c.cloudBuildSourceBucketLocation,
    storageClass: "STANDARD",
    uniformBucketLevelAccess: true,
    labels: { system: "proxus-v2", layer: "foundation", managed_by: "alchemy", purpose: "cloud-build-source" },
  }), c.adoptExisting)
  const production = yield* account("proxus-production-deployer", "Proxus production Alchemy deployer")
  const preview = yield* account("proxus-preview-deployer", "Proxus preview Alchemy deployer")
  const member = (accountId: string) => assertPrivateMember(`serviceAccount:${accountId}@${c.project}.iam.gserviceaccount.com`)
  yield* GCP.projectIamMember(project, "CloudBuildLogWriter", { role: "roles/logging.logWriter", member: member("proxus-cloud-build") })
  yield* GCP.projectIamMember(project, "BuildSubmitter", { role: "roles/cloudbuild.builds.editor", member: member("proxus-build-submitter") })
  yield* protectedResource(GCP.StorageBucketIamMember("CloudBuildSourceViewer", cloudBuildSourceViewerGrant(c)), c.adoptExisting)
  for (const role of productionRoles) yield* GCP.projectIamMember(project, `Production-${role}`, { role, member: member("proxus-production-deployer") })
  for (const role of previewRoles) yield* GCP.projectIamMember(project, `Preview-${role}`, { role, member: member("proxus-preview-deployer") })
  yield* GCP.serviceAccountIamMember(executor, "SubmitterUsesExecutor", { role: "roles/iam.serviceAccountUser", member: member("proxus-build-submitter") })
  for (const [id, role, accountId] of [["ExecutorImageWriter", "roles/artifactregistry.writer", "proxus-cloud-build"], ["ProductionImageReader", "roles/artifactregistry.reader", "proxus-production-deployer"]] as const)
    yield* protectedResource(GCP.ArtifactRegistryRepositoryIamMember(id, { repository: repositoryName, role, member: member(accountId) }), c.adoptExisting)

  const identity = (purpose: "production" | "preview", workflows: readonly string[]) => Effect.gen(function* () {
    const poolId = `github-${purpose}`
    const pool = yield* protectedResource(GCP.WorkloadIdentityPool(`Github-${purpose}`, { project: c.projectNumber, poolId, displayName: `GitHub ${purpose}`, description: `Keyless GitHub Actions identities for ${purpose}`, disabled: false }), c.adoptExisting)
    const refs = workflows.map((w) => `assertion.workflow_ref == '${c.githubRepository}/.github/workflows/${w}@refs/heads/main'`).join(" || ")
    const provider = yield* protectedResource(GCP.WorkloadIdentityPoolProvider(`Github-${purpose}-Provider`, { project: c.projectNumber, poolId, providerId: "github", displayName: `GitHub ${purpose} workflow`, oidc: { issuerUri: "https://token.actions.githubusercontent.com" }, attributeMapping: { "google.subject": "assertion.sub", "attribute.repository": "assertion.repository", "attribute.workflow_ref": "assertion.workflow_ref" }, attributeCondition: `assertion.repository == '${c.githubRepository}' && assertion.sub == 'repo:${c.githubRepository}:environment:${purpose}' && (${refs})` }), c.adoptExisting)
    return { pool, provider }
  })
  const prodIdentity = yield* identity("production", ["deploy-production.yml"])
  const previewIdentity = yield* identity("preview", ["deploy-preview.yml", "reconcile-previews.yml"])
  for (const [purpose, identity, deployer] of [["Production", prodIdentity, production], ["Preview", previewIdentity, preview]] as const) {
    const poolId = purpose === "Production" ? "github-production" : "github-preview"
    const principal = `principalSet://iam.googleapis.com/projects/${c.projectNumber}/locations/global/workloadIdentityPools/${poolId}/attribute.repository/${c.githubRepository}`
    yield* GCP.serviceAccountIamMember(submitter, `${purpose}Build`, { role: "roles/iam.workloadIdentityUser", member: assertPrivateMember(principal) })
    yield* GCP.serviceAccountIamMember(deployer, `${purpose}Deploy`, { role: "roles/iam.workloadIdentityUser", member: assertPrivateMember(principal) })
  }
  for (const [name, principal] of stateBackendPrincipals(c)) {
    const m = principal
    yield* protectedResource(GCP.StorageBucketIamMember(`${name}StateObjects`, { bucket: c.stateBucket, role: "roles/storage.objectAdmin", member: m }), c.adoptExisting)
    yield* protectedResource(GCP.StorageBucketIamMember(`${name}StateList`, { bucket: c.stateBucket, role: "roles/storage.legacyBucketReader", member: m }), c.adoptExisting)
    yield* protectedResource(CryptoKeyIamMember(`${name}StateEncryption`, { cryptoKey: c.stateKmsKey, role: "roles/cloudkms.cryptoKeyEncrypterDecrypter", member: m }), c.adoptExisting)
  }
  return { projectId: project.projectId, projectNumber: project.projectNumber, region: c.region, cloudBuildSourceBucket: sourceBucket.name, artifactRegistryRepository: repository.fullyQualifiedName, artifactRegistryBase: repository.registryUri, cloudBuildExecutorEmail: executor.email, buildSubmitterEmail: submitter.email, productionDeployerEmail: production.email, previewDeployerEmail: preview.email, productionWorkloadIdentityProvider: prodIdentity.provider.name, previewWorkloadIdentityProvider: previewIdentity.provider.name }
})
