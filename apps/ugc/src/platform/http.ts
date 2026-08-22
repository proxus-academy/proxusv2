import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

export const UgcHttpClientLive = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })),
)
