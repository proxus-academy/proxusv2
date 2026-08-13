import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Layer } from "effect"
import { HttpProdLive } from "./layers/http.prod.js"

Layer.launch(HttpProdLive).pipe(NodeRuntime.runMain)
