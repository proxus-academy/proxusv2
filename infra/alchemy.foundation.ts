import { Stack } from "alchemy"
import { readFoundationConfig } from "./src/alchemy/foundation-config.ts"
import { Foundation } from "./src/alchemy/components/foundation.ts"
import { proxusProviders } from "./src/alchemy/providers/index.ts"
import { previewPlatformStateLive } from "./src/alchemy/state/preview-platform-live.ts"

const config = readFoundationConfig(process.env)
export default Stack("foundation", {
  providers: proxusProviders({ project: config.project, location: config.region }),
  state: previewPlatformStateLive({ project: config.project, bucket: config.stateBucket, keyName: config.stateKmsKey, lease: config.lease }),
}, Foundation(config))
