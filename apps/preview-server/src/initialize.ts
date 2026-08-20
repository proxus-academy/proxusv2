import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { initializePreviewDatabase } from "@proxus/backend-infra/database/preview-initialize"
import { Effect } from "effect"

NodeRuntime.runMain(Effect.scoped(initializePreviewDatabase))
