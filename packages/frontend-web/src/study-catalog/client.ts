import { makePublicStudyCatalogClientLayer } from "@proxus/frontend-core/study-catalog"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

export const makeWebPublicStudyCatalogClientLayer = (baseUrl: string) =>
  makePublicStudyCatalogClientLayer(baseUrl).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
