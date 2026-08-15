import { Stack } from "alchemy"
import { Effect } from "effect"
import { PreviewEnvironment } from "./src/alchemy/components/preview-environment.ts"
import { foundationProjectReference, readPreviewStackConfig } from "./src/alchemy/preview-stack-config.ts"
import { proxusProviders } from "./src/alchemy/providers/index.ts"
import { previewPlatformStateLive } from "./src/alchemy/state/preview-platform-live.ts"

const config = readPreviewStackConfig(process.env)

export default Stack(
  "preview",
  {
    providers: proxusProviders({ project: config.project, location: config.region }),
    state: previewPlatformStateLive({ project: config.project, bucket: config.stateBucket, keyName: config.kmsKeyName, lease: config.lease }),
  },
  // PreviewEnvironment keeps provider errors/requirements abstract for cloud-free tests;
  // this entrypoint supplies both through the Stack provider bundle above.
  Effect.gen(function* () {
    const project = foundationProjectReference()
    const preview = yield* PreviewEnvironment({
      prNumber: config.prNumber,
      deployServices: config.deployServices,
      foundation: {
        project, projectId: config.project,
        projectNumber: config.projectNumber, location: config.region, previewDeployer: config.previewDeployer,
      },
      cloudSql: config.cloudSql, images: config.images, secrets: config.secrets,
      analytics: config.analytics, mailgun: config.mailgun, iapAccessPrincipal: config.iapAccessPrincipal,
    })
    return {
      databaseBootstrapJob: preview.databaseBootstrapJob,
      migrationJob: preview.migrationJob,
      publicUrl: preview.public?.publicUrl,
      adminUrl: preview.admin?.adminUrl,
    }
  }) as Effect.Effect<{
    readonly databaseBootstrapJob: unknown
    readonly migrationJob: unknown
    readonly publicUrl: unknown
    readonly adminUrl: unknown
  }, never, never>,
)
