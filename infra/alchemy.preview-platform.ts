import { Stack } from "alchemy"
import { Effect } from "effect"
import { PreviewPlatform, type PreviewPlatformOutputs } from "./src/alchemy/components/preview-platform.ts"
import { readPreviewPlatformStackConfig } from "./src/alchemy/preview-platform-config.ts"
import { proxusProviders } from "./src/alchemy/providers/index.ts"
import { previewPlatformStateLive } from "./src/alchemy/state/preview-platform-live.ts"

const config = readPreviewPlatformStackConfig(process.env)

export default Stack(
  "preview-platform",
  {
    providers: proxusProviders({ project: config.project, location: config.region }),
    state: previewPlatformStateLive({
      project: config.project,
      bucket: config.stateBucket,
      keyName: config.kmsKeyName,
      lease: config.lease,
    }),
  },
  Effect.gen(function* () {
    return (yield* PreviewPlatform({
      project: config.project,
      region: config.region,
      ...(config.instanceName === undefined ? {} : { instanceName: config.instanceName }),
    })) satisfies PreviewPlatformOutputs
  }),
)
