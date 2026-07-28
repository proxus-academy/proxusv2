import { FeatureFlagDistribution } from "@proxus/frontend-core/feature-flags"
import { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Effect, Layer, Schema } from "effect"
import {
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { featureFlagDistributionWebLayer } from "./distribution.web.js"

const snapshot: FeatureFlagSnapshot = {
  configurationRevision: 7,
  flags: [],
}

describe("web feature flag distribution", () => {
  it("uses the /api base with the typed client without opening a network connection", () => Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const urls: Array<string> = []
      const responseBody = Schema.encodeSync(
        Schema.fromJsonString(FeatureFlagSnapshot),
      )(snapshot)
      const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
      const httpClient = HttpClient.makeWith(
        Effect.fnUntraced(function*(requestEffect) {
          const request = yield* requestEffect
          urls.push(request.url)
          return HttpClientResponse.fromWeb(
            request,
            new Response(responseBody, {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          )
        }),
        preprocess,
      )
      const context = yield* Layer.build(
        featureFlagDistributionWebLayer().pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
        ),
      )
      const received = yield* FeatureFlagDistribution.use(
        (distribution) => distribution.getActiveSnapshot(),
      ).pipe(Effect.provide(context))

      expect(received).toEqual(snapshot)
      expect(urls).toEqual(["/api/feature-flags/snapshot"])
    })),
  ))
})
