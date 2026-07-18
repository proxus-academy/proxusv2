import { FeatureFlagSnapshotClient, PublicRealtimeClient } from "@proxus/frontend-core/feature-flags"
import { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { PublicRealtimeEvent } from "@proxus/shared/realtime"
import { Data, Effect, Layer, Schema, Stream } from "effect"

class RealtimeWebError extends Data.TaggedError("RealtimeWebError")<{ readonly reason: string }> {}
const decodeSnapshot = Schema.decodeUnknownEffect(FeatureFlagSnapshot)
const decodeEventJson = Schema.decodeUnknownEffect(Schema.fromJsonString(PublicRealtimeEvent))
const failure = (reason: string) => new RealtimeWebError({ reason })
// The block keeps the diagnostics exception immediately adjacent to the browser global.
// @effect-diagnostics-next-line unnecessaryArrowBlock:off
const browserFetch = (input: string, init: RequestInit): Promise<Response> => {
  // This is the browser adapter boundary.
  // @effect-diagnostics-next-line globalFetch:off
  return fetch(input, init)
}

/** Fetch streaming is used instead of EventSource so retry, cancellation, and credentials are explicit. */
export const featureFlagRealtimeWebLayer = (baseUrl = "") => Layer.mergeAll(
  Layer.succeed(FeatureFlagSnapshotClient, FeatureFlagSnapshotClient.of({
    getSnapshot: Effect.tryPromise({
      try: (signal) => browserFetch(`${baseUrl}/feature-flags/snapshot`, { signal, credentials: "include" }),
      catch: () => failure("snapshot-request"),
    }).pipe(
      Effect.filterOrFail((response) => response.ok, () => failure("snapshot-unavailable")),
      Effect.flatMap((response) => Effect.tryPromise({ try: () => response.json(), catch: () => failure("snapshot-json") })),
      Effect.flatMap(decodeSnapshot),
      Effect.mapError(() => failure("invalid-snapshot")),
    ),
  })),
  Layer.succeed(PublicRealtimeClient, PublicRealtimeClient.of({
    events: Stream.unwrap(Effect.tryPromise({
      try: (signal) => browserFetch(`${baseUrl}/realtime/events`, {
        signal, credentials: "include", headers: { accept: "text/event-stream" },
      }),
      catch: () => failure("connection"),
    }).pipe(
      Effect.filterOrFail((response) => response.ok && response.body !== null, () => failure("rejected")),
      Effect.map((response) => Stream.fromReadableStream({
        evaluate: () => response.body!,
        onError: () => failure("stream"),
      }).pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((line) => line.startsWith("data:")),
        Stream.map((line) => line.slice(5).trim()),
        Stream.mapEffect((data) => decodeEventJson(data).pipe(Effect.mapError(() => failure("invalid-event")))),
      )),
    )),
  })),
)
