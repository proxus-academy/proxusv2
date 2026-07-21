import { FeatureFlagSnapshotReader } from "@proxus/backend-domain/feature-flags"
import { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const cacheControl = "public, max-age=300, stale-while-revalidate=300"
const decodeSnapshot = Schema.decodeUnknownEffect(FeatureFlagSnapshot)
const snapshotResponse = HttpServerResponse.schemaJson(FeatureFlagSnapshot)
const internalServerError = () => new HttpApiError.InternalServerError({})

export const featureFlagEtagFor = (revision: number) => `\"feature-flags-${revision}\"`

const parseEntityTags = (header: string): ReadonlyArray<string> | null => {
  const tags: Array<string> = []
  let offset = 0
  const skipWhitespace = () => {
    while (header[offset] === " " || header[offset] === "\t") offset++
  }

  skipWhitespace()
  while (offset < header.length) {
    const start = offset
    if (header.startsWith("W/", offset)) offset += 2
    if (header[offset] !== "\"") return null
    offset++

    let closed = false
    while (offset < header.length) {
      const code = header.charCodeAt(offset)
      if (code === 0x22) {
        offset++
        closed = true
        break
      }
      if (code !== 0x21 && (code < 0x23 || code > 0x7e) && (code < 0x80 || code > 0xff)) return null
      offset++
    }
    if (!closed) return null
    tags.push(header.slice(start, offset))

    skipWhitespace()
    if (offset === header.length) return tags
    if (header[offset] !== ",") return null
    offset++
    skipWhitespace()
    if (offset === header.length) return null
  }
  return null
}

/** RFC 9110 weak comparison for If-None-Match on GET/HEAD. */
export const ifNoneMatchMatches = (header: string | undefined, current: string) => {
  if (header === undefined) return false
  if (header.trim() === "*") return true
  const tags = parseEntityTags(header)
  if (tags === null) return false
  const opaque = (tag: string) => tag.startsWith("W/") ? tag.slice(2) : tag
  return tags.some((tag) => opaque(tag) === opaque(current))
}

export const PublicFeatureFlagHandlers = HttpApiBuilder.group(PublicApi, "featureFlags", Effect.fn(function* (handlers) {
  const featureFlagSnapshots = yield* FeatureFlagSnapshotReader
  return handlers.handleRaw("getActiveSnapshot", ({ headers }) => Effect.gen(function*() {
    const snapshot = yield* featureFlagSnapshots.getActiveSnapshot().pipe(
      Effect.flatMap(decodeSnapshot),
      Effect.mapError(internalServerError),
    )
    const etag = featureFlagEtagFor(snapshot.configurationRevision)
    const responseHeaders = { "cache-control": cacheControl, etag }
    if (ifNoneMatchMatches(headers["if-none-match"], etag)) {
      return HttpServerResponse.empty({ status: 304, headers: responseHeaders })
    }
    return yield* snapshotResponse(snapshot, { headers: responseHeaders }).pipe(
      Effect.mapError(internalServerError),
    )
  }))
}))
