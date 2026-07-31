import { applicationRuntime } from "@proxus/frontend-core/runtime"
import { makePublicApiClientLayer } from "@proxus/frontend-core/public-api"
import { WebHttpClientLive } from "./platform/http/index.js"
import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

/** Platform services selected by the web application for its shared runtime. */
export const WebApplicationLive = Layer.merge(
  makePublicApiClientLayer("/api").pipe(Layer.provide(WebHttpClientLive)),
  Reactivity.layer,
)

export const webRuntimeInitialValues = [
  Atom.initialValue(applicationRuntime.layer, WebApplicationLive),
] as const
