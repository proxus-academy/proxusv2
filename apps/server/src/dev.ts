import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Layer } from "effect"
import { HttpDevLive } from "./layers/http.js"

Layer.launch(HttpDevLive).pipe(NodeRuntime.runMain)
