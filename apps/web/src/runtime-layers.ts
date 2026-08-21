import { applicationRuntime } from "@proxus/frontend-core/runtime"
import { makePublicApiClientLayer } from "@proxus/frontend-core/public-api"
import { WebHttpClientLive } from "./platform/http/index.js"
import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { realtimeRuntime } from "@proxus/frontend-core/realtime"
import { RealtimeClientWeb } from "./platform/realtime/index.js"

/** Platform services selected by the web application for its shared runtime. */
export const WebApplicationLive = Layer.merge(
  makePublicApiClientLayer("/api").pipe(Layer.provide(WebHttpClientLive)),
  Reactivity.layer,
)

export const WebRealtimeLive = Layer.merge(RealtimeClientWeb, Reactivity.layer)

export const webRuntimeInitialValues = [
  Atom.initialValue(applicationRuntime.layer, WebApplicationLive),
  Atom.initialValue(realtimeRuntime.layer, WebRealtimeLive),
] as const
