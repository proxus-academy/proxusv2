import { makePublicApiClientLayer } from "@proxus/frontend-core/public-api"
import { applicationRuntime } from "@proxus/frontend-core/runtime"
import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { UgcHttpClientLive } from "./platform/http.js"

const UgcApplicationLive = Layer.merge(
  makePublicApiClientLayer("/api").pipe(Layer.provide(UgcHttpClientLive)),
  Reactivity.layer,
)

export const ugcRuntimeInitialValues = [Atom.initialValue(applicationRuntime.layer, UgcApplicationLive)] as const
