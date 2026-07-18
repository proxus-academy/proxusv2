import { FeatureFlagDistribution, FeatureFlagDistributionError } from "@proxus/frontend-core/feature-flags"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

/** Browser Fetch adapter for the platform-neutral distribution port. */
export const makeFeatureFlagDistributionWebLive = (baseUrl: string) => Layer.effect(
  FeatureFlagDistribution,
  HttpApiClient.make(PublicApi, { baseUrl }).pipe(
    Effect.map((client) => FeatureFlagDistribution.of({
      getActiveSnapshot: () => client.getActiveSnapshot().pipe(
        Effect.mapError((cause) => new FeatureFlagDistributionError({ cause })),
      ),
    })),
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(FetchHttpClient.layer),
  ),
)
