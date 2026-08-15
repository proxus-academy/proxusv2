import { Stack } from "alchemy"
import { Effect } from "effect"
import { ProductionEdge } from "./src/alchemy/components/production-edge.ts"
import { ProductionRuntime } from "./src/alchemy/components/production-runtime.ts"
import { ProductionWebsite } from "./src/alchemy/components/production-website.ts"
import { productionProjectReference, readProductionStackConfig } from "./src/alchemy/production-stack-config.ts"
import { proxusProviders } from "./src/alchemy/providers/index.ts"
import { previewPlatformStateLive } from "./src/alchemy/state/preview-platform-live.ts"

const config = readProductionStackConfig(process.env)
export default Stack("production", {
  providers: proxusProviders({ project: config.project, location: config.region }),
  state: previewPlatformStateLive({ project: config.project, bucket: config.stateBucket, keyName: config.kmsKeyName, lease: config.lease }),
}, Effect.gen(function* () {
  const project = productionProjectReference()
  const runtime = yield* ProductionRuntime({ deployServices: config.deployServices, foundation: { project, projectId: config.project, projectNumber: config.projectNumber, location: config.region, productionDeployer: config.productionDeployer }, images: config.images, secrets: config.secrets, analytics: config.analytics, mailgun: config.mailgun, iapAccessPrincipal: config.iapAccessPrincipal })
  if (!config.deployServices) return { migrationJob: runtime.migrationJob, publicApiUrl: undefined, adminUrl: undefined, websiteUrl: undefined, address: undefined, requiredDnsARecord: undefined }
  const website = yield* ProductionWebsite({ project: config.project, bucketName: config.bucketName, bucketLocation: config.region, manifest: config.manifest })
  const edge = yield* ProductionEdge({ project: config.project, domain: config.domain, website, runtime })
  return { migrationJob: runtime.migrationJob, publicApiUrl: runtime.publicApi?.url, adminUrl: runtime.admin?.url, websiteUrl: `https://${config.domain}`, address: edge.address, requiredDnsARecord: edge.requiredDnsARecord }
}))
