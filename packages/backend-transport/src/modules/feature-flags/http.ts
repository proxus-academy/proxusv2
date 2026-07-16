import { FeatureFlags } from "@proxus/backend-domain/feature-flags"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

const cacheControl = "public, max-age=60, stale-while-revalidate=300"
export const featureFlagEtagFor = (revision: number) => `\"feature-flags-${revision}\"`

/** RFC 9110 weak comparison for If-None-Match on GET/HEAD. */
export const ifNoneMatchMatches = (header: string | undefined, current: string) => {
  if (header === undefined) return false
  const opaque = (tag: string) => tag.trim().replace(/^W\//i, "")
  return header.split(",").some((candidate) => {
    const tag = candidate.trim()
    return tag === "*" || (/^(?:W\/)?\"[^\"]*\"$/i.test(tag) && opaque(tag) === opaque(current))
  })
}

export const PublicFeatureFlagHandlers = HttpApiBuilder.group(PublicApi, "featureFlags", Effect.fn(function* (handlers) {
  const featureFlags = yield* FeatureFlags
  return handlers.handleRaw("getActiveSnapshot", () => Effect.gen(function*() {
    const snapshot = yield* featureFlags.getActiveSnapshot().pipe(Effect.orDie)
    const request = yield* HttpServerRequest.HttpServerRequest
    const etag = featureFlagEtagFor(snapshot.configurationRevision)
    const headers = { "cache-control": cacheControl, etag }
    if (ifNoneMatchMatches(request.headers["if-none-match"], etag)) {
      return HttpServerResponse.empty({ status: 304, headers })
    }
    return HttpServerResponse.jsonUnsafe(snapshot, { headers })
  }))
}))
