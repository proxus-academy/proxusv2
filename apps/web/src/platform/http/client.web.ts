import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

/** Browser implementation used by every typed HTTP API client. */
export const WebHttpClientLive = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })),
)
