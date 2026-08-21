import { FeatureFlagDistribution, FeatureFlagDistributionError } from "@proxus/frontend-core/feature-flags"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

/** Browser adapter with an injectable HTTP client for deterministic contract tests. */
export const featureFlagDistributionWebLayer = (baseUrl = "/api") => Layer.effect(
  FeatureFlagDistribution,
  HttpApiClient.make(PublicApi, { baseUrl }).pipe(
    Effect.map((client) => FeatureFlagDistribution.of({
      getActiveSnapshot: () => client.getActiveSnapshot({ headers: {} }).pipe(
        Effect.mapError((cause) => new FeatureFlagDistributionError({ cause })),
        Effect.flatMap((snapshot) => snapshot === undefined
          ? Effect.fail(new FeatureFlagDistributionError({ cause: "unexpected-not-modified-response" }))
          : Effect.succeed(snapshot)),
      ),
    })),
  ),
)

/** Live browser Fetch composition; public APIs are always rooted at `/api`. */
export const makeFeatureFlagDistributionWebLive = (baseUrl = "/api") =>
  featureFlagDistributionWebLayer(baseUrl).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
