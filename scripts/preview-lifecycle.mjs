import { randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const PROJECT = process.env.PREVIEW_PROJECT ?? "proxus-v2"
const REGION = process.env.PREVIEW_REGION ?? "europe-southwest1"
const SQL_INSTANCE = process.env.PREVIEW_SQL_INSTANCE ?? "proxus-previews"
const SQL_CONNECTION = `${PROJECT}:${REGION}:${SQL_INSTANCE}`
const REPOSITORY = `projects/${PROJECT}/locations/${REGION}/connections/proxus-github/repositories/proxusv2`
const BUILD_SA = `projects/${PROJECT}/serviceAccounts/proxus-cloud-build@${PROJECT}.iam.gserviceaccount.com`
const RUNTIME_SA = `proxus-preview-runtime@${PROJECT}.iam.gserviceaccount.com`
const IMAGE_REPOSITORY = `${REGION}-docker.pkg.dev/${PROJECT}/proxus/preview`
const CONFIG = resolve("infra/previews/cloudbuild.deploy.yaml")
const IAP_GROUP = process.env.PREVIEW_IAP_GROUP ?? ""

const [operation, rawPr, branch = ""] = process.argv.slice(2)
if (!['create', 'destroy'].includes(operation) || !/^\d+$/.test(rawPr ?? "")) {
  throw new Error("usage: preview-lifecycle.mjs <create|destroy> <pr-number> [head-branch]")
}
if (operation === "create" && (!branch || /[\n\r]/.test(branch))) throw new Error("create requires a safe head branch")
if (operation === "create" && !/^[^@\s]+@[^@\s]+$/.test(IAP_GROUP)) {
  throw new Error("create requires PREVIEW_IAP_GROUP with a Google Group email address")
}

const id = `pr-${rawPr}`
const service = `proxus-${id}`
const database = `proxus_preview_${rawPr}`
const user = database
const secret = `${service}-database-url`
const trigger = service
const job = `${service}-initialize`

function run(command, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", input, stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"] })
  if (result.status !== 0 && !allowFailure) throw new Error(`${command} ${args[0] ?? ""} failed (${result.status})`)
  return result.status === 0
}
function gcloud(...args) { return run("gcloud", [...args, `--project=${PROJECT}`]) }
function exists(...args) { return run("gcloud", [...args, `--project=${PROJECT}`, "--quiet"], { allowFailure: true }) }
function remove(...args) { return run("gcloud", [...args, `--project=${PROJECT}`, "--quiet"], { allowFailure: true }) }
function capture(...args) {
  const result = spawnSync("gcloud", [...args, `--project=${PROJECT}`], { encoding: "utf8" })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    throw new Error(`gcloud ${args[0] ?? ""} failed (${result.status})`)
  }
  return result.stdout.trim()
}
function waitForBuild(buildId) {
  gcloud("beta", "builds", "log", buildId, `--region=${REGION}`, "--stream")
  const status = capture("builds", "describe", buildId, `--region=${REGION}`, "--format=value(status)")
  if (status !== "SUCCESS") throw new Error(`Cloud Build ${buildId} ended with ${status}`)
}

function destroy() {
  remove("builds", "triggers", "delete", trigger, `--region=${REGION}`)
  remove("run", "services", "delete", service, `--region=${REGION}`)
  remove("run", "jobs", "delete", job, `--region=${REGION}`)
  remove("sql", "databases", "delete", database, `--instance=${SQL_INSTANCE}`)
  remove("sql", "users", "delete", user, `--instance=${SQL_INSTANCE}`)
  remove("secrets", "delete", secret)
}

function create() {
  const databaseExists = exists("sql", "databases", "describe", database, `--instance=${SQL_INSTANCE}`)
  const secretExists = exists("secrets", "describe", secret)
  const needsInitialization = !databaseExists || !secretExists
  if (!databaseExists) gcloud("sql", "databases", "create", database, `--instance=${SQL_INSTANCE}`)
  if (!secretExists) {
    const password = randomBytes(24).toString("hex")
    if (databaseExists) gcloud("sql", "users", "set-password", user, `--instance=${SQL_INSTANCE}`, `--password=${password}`)
    else gcloud("sql", "users", "create", user, `--instance=${SQL_INSTANCE}`, `--password=${password}`)
    const url = `postgresql://${user}:${password}@localhost/${database}?host=/cloudsql/${SQL_CONNECTION}\n`
    run("gcloud", ["secrets", "create", secret, "--replication-policy=automatic", "--data-file=-", `--project=${PROJECT}`], { input: url })
    gcloud("secrets", "add-iam-policy-binding", secret, `--member=serviceAccount:${RUNTIME_SA}`, "--role=roles/secretmanager.secretAccessor", "--quiet")
  }

  const branchPattern = `^${branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
  const installTrigger = (initialize) => {
    remove("builds", "triggers", "delete", trigger, `--region=${REGION}`)
    gcloud("builds", "triggers", "create", "github", `--name=${trigger}`, `--region=${REGION}`, `--repository=${REPOSITORY}`, `--branch-pattern=${branchPattern}`, `--inline-config=${CONFIG}`, `--service-account=${BUILD_SA}`, `--substitutions=_REGION=${REGION},_SERVICE=${service},_PREVIEW_ID=${id},_IMAGE_REPOSITORY=${IMAGE_REPOSITORY},_RUNTIME_SERVICE_ACCOUNT=${RUNTIME_SA},_BUILD_SERVICE_ACCOUNT=proxus-cloud-build@${PROJECT}.iam.gserviceaccount.com,_CLOUD_SQL_CONNECTION=${SQL_CONNECTION},_DATABASE_SECRET=${secret},_IAP_GROUP=${IAP_GROUP},_INITIALIZE=${initialize}`)
  }
  installTrigger(needsInitialization)
  const buildId = capture("builds", "triggers", "run", trigger, `--region=${REGION}`, `--branch=${branch}`, "--format=value(metadata.build.id)")
  waitForBuild(buildId)
  if (needsInitialization) installTrigger(false)
}

if (operation === "create") create()
else destroy()
