import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Layer } from "effect"
import { HttpProdLive } from "./layers/http.js"

Layer.launch(HttpProdLive).pipe(NodeRuntime.runMain)
